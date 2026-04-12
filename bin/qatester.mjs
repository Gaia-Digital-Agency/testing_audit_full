import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { profileTarget } from "./lib/target-profiler.mjs";
import { buildExecutionPlan } from "./lib/orchestration.mjs";
import { buildSimplePdf, renderReport, renderOkReport, renderErrorsReport } from "./lib/reporting.mjs";
import { enrichTargetProfile } from "./lib/target-profiler.mjs";
import { executeAuditPlan } from "./lib/execution.mjs";
import { sanitizeSegment } from "./lib/utils.mjs";
import { stdout } from "node:process";

function writeExecutionPreview(executionPlan) {
  stdout.write("\n────────────────────────────────────────────────────────\n");
  stdout.write("  TOOL CHAIN  (lightest → most extensive)\n");
  stdout.write("────────────────────────────────────────────────────────\n");

  for (const tool of executionPlan.executionTimeline) {
    const bar = "█".repeat(Math.max(1, Math.round(tool.estimatedMinutes)));
    stdout.write(
      `  ${tool.order}. ${tool.toolName.padEnd(14)} ${bar} ~${tool.estimatedMinutes.toFixed(1)} min  (weight ${tool.order}/7)\n`
    );
    stdout.write(`     ${tool.heavinessSummary}\n`);
  }

  stdout.write("────────────────────────────────────────────────────────\n");
  stdout.write(`  Estimated total: ~${executionPlan.totalEstimatedMinutes.toFixed(1)} minute(s)\n`);
  stdout.write("────────────────────────────────────────────────────────\n\n");
}

function makeProgressPrinter() {
  let toolsCompleted = 0;
  let totalTools = 0;

  return {
    setTotal(count) { totalTools = count; },
    onProgress(event) {
      toolsCompleted += 1;
      const pct = totalTools > 0 ? Math.round((toolsCompleted / totalTools) * 100) : 0;
      const icon = event.status === "completed" ? "✓" : event.status === "degraded" ? "⚠" : "✗";
      stdout.write(
        `  [${pct.toString().padStart(3)}%] ${icon} ${event.toolName.padEnd(14)} ${event.status} in ${event.elapsedSeconds}s — ${event.detail}\n`
      );
    }
  };
}

/**
 * Parse SSH command string into components.
 * Accepts formats:
 *   ssh user@host
 *   ssh host            (user defaults to current user)
 *   user@host
 *   host
 *   ssh -i key user@host
 */
function parseSshCommand(raw) {
  const cleaned = raw.replace(/^ssh\s+/i, "").replace(/-i\s+\S+\s*/g, "").trim();
  if (cleaned.includes("@")) {
    const [user, ...rest] = cleaned.split("@");
    return { sshUser: user, sshHost: rest.join("@") };
  }
  return { sshUser: "", sshHost: cleaned };
}

async function promptForRun() {
  const rl = createInterface({ input, output });

  try {
    stdout.write("\n════════════════════════════════════════════════════════\n");
    stdout.write("  QUALITY TESTER\n");
    stdout.write("════════════════════════════════════════════════════════\n");
    stdout.write("  Runtime : Node.js + Chromium / Firefox / WebKit\n");
    stdout.write("  Tools   : Playwright · axe-core · Lighthouse ·\n");
    stdout.write("            Crawlee · sitespeed.io · Puppeteer ·\n");
    stdout.write("            Selenium\n");
    stdout.write("════════════════════════════════════════════════════════\n\n");

    const projectName = (await rl.question("  Project name           : ")).trim();
    const baseUrl = (await rl.question("  URL                    : ")).trim();
    const sshCommand = (await rl.question("  SSH command            : ")).trim();
    const sshProjectPath = (await rl.question("  Server project path    : ")).trim();
    const modeInput = (await rl.question("  Mode (smoke / full)    : ")).trim().toLowerCase();
    const mode = modeInput === "full" ? "full" : "smoke";

    const { sshUser, sshHost } = parseSshCommand(sshCommand);

    stdout.write("\n");

    return {
      projectName,
      baseUrl,
      sshHost,
      sshUser,
      sshProjectPath,
      sshCommand,
      authUser: "",
      authPassword: "",
      mode
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const run = await promptForRun();
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const folderName = `${timestamp}-${sanitizeSegment(run.projectName)}-${run.mode}`;
  const outputDir = path.resolve(process.cwd(), "output");
  const runDir = path.join(outputDir, folderName);

  // Create run directory early so tools can write artifacts into it
  await mkdir(runDir, { recursive: true });

  const authSummary = "Not applicable";
  const targetProfile = await enrichTargetProfile(run, profileTarget(run));
  const executionPlan = buildExecutionPlan(targetProfile, run.mode);

  writeExecutionPreview(executionPlan);

  // Real-time progress
  const progress = makeProgressPrinter();
  const activeToolCount = executionPlan.selectedTools.filter((t) => t.selected).length;
  progress.setTotal(activeToolCount);

  stdout.write("  Running audit…\n\n");

  const executionResult = await executeAuditPlan(run, targetProfile, executionPlan, runDir, progress.onProgress);

  stdout.write("\n  Audit complete. Generating reports…\n");

  const finalCompletedAt = new Date().toISOString();
  const reportData = {
    ...run,
    authSummary,
    targetProfile,
    executionPlan,
    findings: executionResult.findings,
    notes: executionResult.notes,
    artifacts: executionResult.artifacts,
    routeSummaries: executionResult.routeSummaries,
    progressEvents: executionResult.progressEvents,
    metrics: executionResult.metrics,
    startedAt,
    completedAt: finalCompletedAt
  };

  // Generate 3 report types
  const fullReport = renderReport(reportData);
  const okReport = renderOkReport(reportData);
  const errorsReport = renderErrorsReport(reportData);

  const reportFullPath = path.join(runDir, "report-full.md");
  const reportOkPath = path.join(runDir, "report-ok.md");
  const reportErrorsPath = path.join(runDir, "report-errors.md");
  const reportPdfPath = path.join(runDir, "report-full.pdf");

  await Promise.all([
    writeFile(reportFullPath, fullReport, "utf8"),
    writeFile(reportOkPath, okReport, "utf8"),
    writeFile(reportErrorsPath, errorsReport, "utf8"),
    writeFile(reportPdfPath, buildSimplePdf(fullReport), "utf8")
  ]);

  stdout.write("\n════════════════════════════════════════════════════════\n");
  stdout.write("  REPORTS\n");
  stdout.write("════════════════════════════════════════════════════════\n");
  stdout.write(`  Run folder : ${runDir}\n`);
  stdout.write(`  Full report: ${reportFullPath}\n`);
  stdout.write(`  OK only    : ${reportOkPath}\n`);
  stdout.write(`  Errors only: ${reportErrorsPath}\n`);
  stdout.write(`  PDF        : ${reportPdfPath}\n`);
  stdout.write("════════════════════════════════════════════════════════\n\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
