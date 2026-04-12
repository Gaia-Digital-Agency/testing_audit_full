function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildSimplePdf(text) {
  const lines = text.split("\n");
  const contentLines = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"];

  for (const line of lines) {
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    contentLines.push("T*");
  }

  contentLines.push("ET");

  const contentStream = contentLines.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(contentStream, "utf8")} >> stream\n${contentStream}\nendstream endobj`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

// ── OK-Only Report ──────────────────────────────────────────────────────
export function renderOkReport(run) {
  const okSeverities = new Set(["info"]);
  const okFindings = run.findings.filter((f) => okSeverities.has(f.severity));
  const okRoutes = run.routeSummaries.filter(
    (r) =>
      r.consoleErrors === 0 &&
      r.failedRequests === 0 &&
      r.brokenImages === 0 &&
      !r.horizontalOverflow &&
      r.accessibilityViolations === 0 &&
      (r.responseStatus === null || r.responseStatus < 400)
  );

  return [
    `# ${run.projectName} — All OK Report`,
    "",
    `- Mode: \`${run.mode}\``,
    `- Base URL: ${run.baseUrl}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt}`,
    "",
    "## Routes With No Issues",
    "",
    ...(okRoutes.length === 0
      ? ["- No routes passed all checks without issues."]
      : okRoutes.map(
          (r) => `- ${r.browserProject} ${r.route} | status=${r.responseStatus ?? "n/a"} | title: ${r.title || "(no title)"}`
        )),
    "",
    "## Summary",
    "",
    `- Total routes checked: ${run.routeSummaries.length}`,
    `- Routes with zero issues: ${okRoutes.length}`,
    `- Informational observations: ${okFindings.length}`,
    "",
    ...(okFindings.length > 0
      ? [
          "## Informational Observations",
          "",
          ...okFindings.map((f) => `- [INFO] ${f.area}: ${f.title}${f.route ? ` (${f.route})` : ""}\n  ${f.details}`)
        ]
      : []),
    ""
  ].join("\n");
}

// ── Errors-Only Report ──────────────────────────────────────────────────
export function renderErrorsReport(run) {
  const errorSeverities = new Set(["critical", "high", "medium", "low"]);
  const errorFindings = [...run.findings]
    .filter((f) => errorSeverities.has(f.severity))
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      return rank[a.severity] - rank[b.severity];
    });
  const errorRoutes = run.routeSummaries.filter(
    (r) =>
      r.consoleErrors > 0 ||
      r.failedRequests > 0 ||
      r.brokenImages > 0 ||
      r.horizontalOverflow ||
      r.accessibilityViolations > 0 ||
      (r.responseStatus !== null && r.responseStatus >= 400)
  );

  return [
    `# ${run.projectName} — Errors Report`,
    "",
    `- Mode: \`${run.mode}\``,
    `- Base URL: ${run.baseUrl}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt}`,
    "",
    "## Error Summary",
    "",
    `- Total findings: ${errorFindings.length}`,
    `- Critical: ${errorFindings.filter((f) => f.severity === "critical").length}`,
    `- High: ${errorFindings.filter((f) => f.severity === "high").length}`,
    `- Medium: ${errorFindings.filter((f) => f.severity === "medium").length}`,
    `- Low: ${errorFindings.filter((f) => f.severity === "low").length}`,
    "",
    "## Findings",
    "",
    ...(errorFindings.length === 0
      ? ["- No errors found. All checks passed."]
      : errorFindings.flatMap((f) => [
          `### [${f.severity.toUpperCase()}] ${f.area}: ${f.title}`,
          "",
          `- **URL**: ${f.route || "N/A"}`,
          `- **Component/Area**: ${f.area}`,
          `- **Details**: ${f.details}`,
          ""
        ])),
    "## Routes With Errors",
    "",
    ...(errorRoutes.length === 0
      ? ["- No routes had errors."]
      : errorRoutes.flatMap((r) => {
          const issues = [];
          if (r.responseStatus !== null && r.responseStatus >= 400) issues.push(`HTTP ${r.responseStatus}`);
          if (r.consoleErrors > 0) issues.push(`${r.consoleErrors} console error(s)`);
          if (r.failedRequests > 0) issues.push(`${r.failedRequests} failed request(s)`);
          if (r.brokenImages > 0) issues.push(`${r.brokenImages} broken image(s)`);
          if (r.horizontalOverflow) issues.push("horizontal overflow");
          if (r.accessibilityViolations > 0) issues.push(`${r.accessibilityViolations} a11y violation(s)`);
          return [
            `- **${r.route}** (${r.browserProject})`,
            `  Issues: ${issues.join(", ")}`,
          ];
        })),
    ""
  ].join("\n");
}

// ── Full Report ─────────────────────────────────────────────────────────
export function renderReport(run) {
  const selectedTools = run.executionPlan.selectedTools.filter((tool) => tool.selected).map((tool) => tool.name);
  const sortedFindings = [...run.findings].sort((left, right) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return rank[left.severity] - rank[right.severity];
  });

  return [
    `# ${run.projectName} Quality Report`,
    "",
    `- Mode: \`${run.mode}\``,
    `- Base URL: ${run.baseUrl}`,
    `- SSH Target: ${run.sshUser}@${run.sshHost}:${run.sshProjectPath}`,
    `- Auth Input: ${run.authSummary}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt}`,
    "",
    "## Run Input",
    "",
    `- Project Name: ${run.projectName}`,
    `- External URL: ${run.baseUrl}`,
    `- SSH Host: ${run.sshHost}`,
    `- SSH User: ${run.sshUser}`,
    `- SSH Project Path: ${run.sshProjectPath}`,
    `- Auth Username: ${run.authUser || "Not provided"}`,
    `- Auth Password: ${run.authPassword ? "[REDACTED]" : "Not provided"}`,
    "",
    "## Detected Target Profile",
    "",
    `- Kind: ${run.targetProfile.targetKind}`,
    `- Rendering Mode: ${run.targetProfile.renderingMode}`,
    `- Likely Frameworks: ${run.targetProfile.likelyFrameworks.length > 0 ? run.targetProfile.likelyFrameworks.join(", ") : "None inferred"}`,
    `- Likely CMS: ${run.targetProfile.likelyCms.length > 0 ? run.targetProfile.likelyCms.join(", ") : "None inferred"}`,
    `- Auth Required: ${run.targetProfile.requiresAuth ? "Yes" : "No"}`,
    `- Signals: ${run.targetProfile.signals.length > 0 ? run.targetProfile.signals.join(" | ") : "No strong signals yet"}`,
    "",
    "## Selected Audit Stack",
    "",
    `- Combined Strategy: ${run.executionPlan.profileSummary}`,
    `- Active Tools: ${selectedTools.join(", ")}`,
    `- Estimated Total Runtime: ~${run.executionPlan.totalEstimatedMinutes.toFixed(1)} minute(s)`,
    "",
    "## Tool Chain Order",
    "",
    ...run.executionPlan.executionTimeline.map(
      (tool) => `- ${tool.order}. ${tool.toolName} | estimated ${tool.estimatedMinutes.toFixed(1)} min | ${tool.heavinessSummary}`
    ),
    "",
    "## Combined Audit Process",
    "",
    ...run.executionPlan.processSteps.map((step) => `- ${step}`),
    "",
    "## Tool Availability",
    "",
    ...run.executionPlan.selectedTools.map(
      (tool) => `- ${tool.selected ? "Selected" : "Available"} ${tool.name}: ${tool.reason}`
    ),
    "",
    "## Status",
    "",
    "- Detection and orchestration completed successfully.",
    "- The selected tools were executed as one combined audit process.",
    ...run.notes.map((note) => `- ${note}`),
    "",
    "## Progress Log",
    "",
    ...(run.progressEvents.length === 0
      ? ["- No progress events were recorded."]
      : run.progressEvents.map(
          (event) =>
            `- ${event.toolName} ${event.status} in ${event.elapsedSeconds}s at ${event.finishedAt}: ${event.detail}`
        )),
    "",
    "## Execution Summary",
    "",
    `- Routes Discovered: ${run.metrics.routesDiscovered}`,
    `- Pages Visited: ${run.metrics.pagesVisited}`,
    `- Console Errors Captured: ${run.metrics.consoleErrors}`,
    `- Failed Requests Captured: ${run.metrics.failedRequests}`,
    `- Accessibility Violations Captured: ${run.metrics.accessibilityViolations}`,
    `- Broken Images Captured: ${run.metrics.brokenImages}`,
    "",
    "## Route Coverage",
    "",
    ...run.routeSummaries.map(
      (route) =>
        `- ${route.browserProject} ${route.route} | status=${route.responseStatus ?? "n/a"} | console=${route.consoleErrors} | failedRequests=${route.failedRequests} | forms=${route.forms} | buttons=${route.buttons} | brokenImages=${route.brokenImages} | overflow=${route.horizontalOverflow ? "yes" : "no"} | a11yViolations=${route.accessibilityViolations}`
    ),
    "",
    "## Findings",
    "",
    ...(sortedFindings.length === 0
      ? ["- No findings recorded."]
      : sortedFindings.flatMap((finding) => [
          `- [${finding.severity.toUpperCase()}] ${finding.area}: ${finding.title}${finding.route ? ` (${finding.route})` : ""}`,
          `  ${finding.details}`
        ])),
    "",
    "## Artifacts",
    "",
    ...(run.artifacts.length === 0 ? ["- None"] : run.artifacts.map((artifact) => `- ${artifact}`)),
    ""
  ].join("\n");
}
