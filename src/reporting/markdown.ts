import type { Finding, RunSummary } from "../types";

function countBySeverity(findings: Finding[], severity: Finding["severity"]): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

export function renderMarkdownReport(summary: RunSummary): string {
  const lines: string[] = [];

  lines.push(`# ${summary.projectName} Quality Report`);
  lines.push("");
  lines.push(`- Mode: \`${summary.mode}\``);
  lines.push(`- Base URL: ${summary.baseUrl}`);
  lines.push(`- SSH Target: ${summary.sshTarget}`);
  lines.push(`- Auth: ${summary.authSummary}`);
  lines.push(`- Started: ${summary.startedAt}`);
  lines.push(`- Completed: ${summary.completedAt}`);
  lines.push("");
  lines.push("## Target Profile");
  lines.push("");
  lines.push(`- Kind: ${summary.targetProfile.targetKind}`);
  lines.push(`- Rendering: ${summary.targetProfile.renderingMode}`);
  lines.push(
    `- Frameworks: ${summary.targetProfile.likelyFrameworks.length > 0 ? summary.targetProfile.likelyFrameworks.join(", ") : "None inferred"}`
  );
  lines.push(`- CMS: ${summary.targetProfile.likelyCms.length > 0 ? summary.targetProfile.likelyCms.join(", ") : "None inferred"}`);
  lines.push(`- Auth Required: ${summary.targetProfile.requiresAuth ? "Yes" : "No"}`);
  lines.push(`- Signals: ${summary.targetProfile.signals.length > 0 ? summary.targetProfile.signals.join(" | ") : "No strong signals yet"}`);
  lines.push("");
  lines.push("## Combined Audit Process");
  lines.push("");
  lines.push(`- Strategy: ${summary.executionPlan.profileSummary}`);
  lines.push(
    `- Selected Tools: ${summary.executionPlan.selectedTools.filter((tool) => tool.selected).map((tool) => tool.name).join(", ")}`
  );
  lines.push("");

  for (const step of summary.executionPlan.processSteps) {
    lines.push(`- ${step}`);
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Critical: ${countBySeverity(summary.findings, "critical")}`);
  lines.push(`- High: ${countBySeverity(summary.findings, "high")}`);
  lines.push(`- Medium: ${countBySeverity(summary.findings, "medium")}`);
  lines.push(`- Low: ${countBySeverity(summary.findings, "low")}`);
  lines.push(`- Info: ${countBySeverity(summary.findings, "info")}`);
  lines.push("");
  lines.push("## Tool Selection");
  lines.push("");

  for (const tool of summary.executionPlan.selectedTools) {
    lines.push(`- ${tool.selected ? "Selected" : "Available"} ${tool.name}: ${tool.reason}`);
  }

  lines.push("");
  lines.push("## Findings");
  lines.push("");

  if (summary.findings.length === 0) {
    lines.push("- No findings recorded.");
  } else {
    for (const finding of summary.findings) {
      lines.push(
        `- [${finding.severity.toUpperCase()}] ${finding.area}: ${finding.title}${finding.route ? ` (${finding.route})` : ""}`
      );
      lines.push(`  ${finding.details}`);
    }
  }

  lines.push("");
  lines.push("## Skipped");
  lines.push("");

  if (summary.skipped.length === 0) {
    lines.push("- None");
  } else {
    for (const item of summary.skipped) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}
