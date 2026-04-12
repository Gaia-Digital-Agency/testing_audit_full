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

async function promptForRun() {
  const rl = createInterface({ input, output });

  try {
    stdout.write("\n════════════════════════════════════════════════════════\n");
    stdout.write("  QUALITY TESTER — Run Configuration\n");
    stdout.write("════════════════════════════════════════════════════════\n");
    stdout.write("  Runtime  : Node.js (ESM) + Chromium/Firefox/WebKit\n");
    stdout.write("  Tools    : Playwright, axe-core, Lighthouse, Crawlee,\n");
    stdout.write("             sitespeed.io, Puppeteer, Selenium\n");
    stdout.write("  Output   : report-full.md, report-ok.md,\n");
    stdout.write("             report-errors.md, report-full.pdf,\n");
    stdout.write("             screenshots/, lighthouse/\n");
    stdout.write("════════════════════════════════════════════════════════\n\n");

    const projectName = (await rl.question("  Project name: ")).trim();
    const baseUrl = (await rl.question("  External URL: ")).trim();
    const sshHost = (await rl.question("  SSH host: ")).trim();
    const sshUser = (await rl.question("  SSH user: ")).trim();
    const sshProjectPath = (await rl.question("  SSH project path: ")).trim();
    const authUser = (await rl.question("  Auth username (optional): ")).trim();
    const authPassword = (await rl.question("  Auth password (optional): ")).trim();
    const modeInput = (await rl.question("  Mode (smoke/full): ")).trim().toLowerCase();
    const mode = modeInput === "full" ? "full" : "smoke";

    stdout.write("\n");

    return {
      projectName,
      baseUrl,
      sshHost,
      sshUser,
      sshProjectPath,
      authUser,
      authPassword,
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

  const authSummary = run.authUser || run.authPassword ? `Provided for user ${run.authUser || "unknown"}` : "Not provided";
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
