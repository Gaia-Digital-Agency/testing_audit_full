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
function renderSourceBlock(source) {
  if (!source) return [];
  const lines = [];

  if (source.type === "axe-rule") {
    lines.push(`- **Rule**: \`${source.ruleId}\` (${source.impact})`);
    if (source.wcagTags && source.wcagTags.length > 0) {
      lines.push(`- **WCAG**: ${source.wcagTags.join(", ")}`);
    }
    if (source.helpUrl) {
      lines.push(`- **Reference**: ${source.helpUrl}`);
    }
    if (source.nodes && source.nodes.length > 0) {
      lines.push("- **Affected elements**:");
      for (const node of source.nodes) {
        lines.push(`  - Selector: \`${node.selector}\``);
        if (node.html) lines.push(`    HTML: \`${node.html}\``);
        if (node.failureSummary) lines.push(`    Fix: ${node.failureSummary}`);
      }
    }
  } else if (source.type === "console-error") {
    lines.push(`- **Console message**: \`${source.message}\``);
  } else if (source.type === "network-failure") {
    lines.push(`- **Failed request**: \`${source.request}\``);
  } else if (source.type === "broken-image") {
    lines.push(`- **Image src**: \`${source.src}\``);
    lines.push(`- **Selector**: \`${source.selector}\``);
    if (source.alt) lines.push(`- **Alt text**: ${source.alt}`);
  } else if (source.type === "http-error") {
    lines.push(`- **HTTP status**: ${source.statusCode}`);
  } else if (source.type === "layout-overflow") {
    lines.push(`- **Issue**: Document scroll width exceeds viewport`);
  }

  return lines;
}

export function renderErrorsReport(run) {
  const errorSeverities = new Set(["critical", "high", "medium", "low"]);
  const errorFindings = [...run.findings]
    .filter((f) => errorSeverities.has(f.severity))
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      return (rank[a.severity] - rank[b.severity]) || (a.route || "").localeCompare(b.route || "");
    });

  // Group findings by URL
  const byRoute = new Map();
  for (const f of errorFindings) {
    const key = f.route || "(no route)";
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key).push(f);
  }

  // Severity counts
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of errorFindings) counts[f.severity] += 1;

  const lines = [
    `# ${run.projectName} — Errors Report`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Mode | \`${run.mode}\` |`,
    `| Base URL | ${run.baseUrl} |`,
    `| Started | ${run.startedAt} |`,
    `| Completed | ${run.completedAt} |`,
    "",
    "---",
    "",
    "## Error Summary",
    "",
    "| Severity | Count |",
    "|---|---|",
    `| CRITICAL | ${counts.critical} |`,
    `| HIGH | ${counts.high} |`,
    `| MEDIUM | ${counts.medium} |`,
    `| LOW | ${counts.low} |`,
    `| **Total** | **${errorFindings.length}** |`,
    "",
  ];

  if (errorFindings.length === 0) {
    lines.push("**No errors found. All checks passed.**", "");
    return lines.join("\n");
  }

  lines.push("---", "");

  // Render grouped by URL
  for (const [route, findings] of byRoute) {
    lines.push(`## ${route}`, "");

    for (const f of findings) {
      const browserTag = f.browser ? ` [${f.browser}]` : "";
      lines.push(`### ${severityBadge(f.severity)} ${f.area}: ${f.title}${browserTag}`, "");
      lines.push(`${f.details}`, "");
      lines.push(...renderSourceBlock(f.source));
      lines.push("");
    }
  }

  // Quick-scan table at the end
  lines.push("---", "", "## Quick Scan Table", "");
  lines.push("| Severity | Area | Issue | URL | Browser | Source |");
  lines.push("|---|---|---|---|---|---|");
  for (const f of errorFindings) {
    const src = f.source
      ? f.source.type === "axe-rule" ? `\`${f.source.ruleId}\`` :
        f.source.type === "broken-image" ? `\`${f.source.src.slice(0, 60)}\`` :
        f.source.type === "console-error" ? `\`${f.source.message.slice(0, 60)}\`` :
        f.source.type === "network-failure" ? `\`${f.source.request.slice(0, 60)}\`` :
        f.source.type || ""
      : "";
    lines.push(`| ${f.severity.toUpperCase()} | ${f.area} | ${f.title.slice(0, 50)} | ${f.route || "N/A"} | ${f.browser || "all"} | ${src} |`);
  }
  lines.push("");

  return lines.join("\n");
}

function severityBadge(severity) {
  const badges = { critical: "🔴 CRITICAL", high: "🟠 HIGH", medium: "🟡 MEDIUM", low: "🔵 LOW" };
  return badges[severity] || severity.toUpperCase();
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
      : sortedFindings.flatMap((finding) => {
          const browserTag = finding.browser ? ` [${finding.browser}]` : "";
          const lines = [
            `### [${finding.severity.toUpperCase()}] ${finding.area}: ${finding.title}${browserTag}`,
            "",
            `- **URL**: ${finding.route || "N/A"}`,
            `- **Details**: ${finding.details}`,
          ];
          lines.push(...renderSourceBlock(finding.source));
          lines.push("");
          return lines;
        })),
    "",
    "## Artifacts",
    "",
    ...(run.artifacts.length === 0 ? ["- None"] : run.artifacts.map((artifact) => `- ${artifact}`)),
    ""
  ].join("\n");
}
