import { getAvailableTools } from "./available-tools.mjs";

const TOOL_PROFILES = {
  "axe-core": {
    weight: 1,
    order: 1,
    baseMinutes: {
      smoke: 0.5,
      full: 1.5
    },
    summary: "Fastest and lightest. Runs accessibility rules inside already-loaded pages."
  },
  crawlee: {
    weight: 2,
    order: 2,
    baseMinutes: {
      smoke: 1,
      full: 4
    },
    summary: "Lightweight discovery layer. Expands route coverage without heavy browser assertions on every step."
  },
  lighthouse: {
    weight: 3,
    order: 3,
    baseMinutes: {
      smoke: 2,
      full: 5
    },
    summary: "Moderate weight. Audits performance, best practices, SEO, and accessibility on key routes."
  },
  playwright: {
    weight: 4,
    order: 4,
    baseMinutes: {
      smoke: 3,
      full: 8
    },
    summary: "Primary execution engine. Heavier than discovery or rules-only tools because it drives real browsers and flows."
  },
  puppeteer: {
    weight: 5,
    order: 5,
    baseMinutes: {
      smoke: 2,
      full: 4
    },
    summary: "More specialized and moderately heavy. Useful for extra Chromium-only instrumentation."
  },
  selenium: {
    weight: 6,
    order: 6,
    baseMinutes: {
      smoke: 2,
      full: 5
    },
    summary: "Compatibility-oriented and usually heavier to maintain than Playwright for the same scope."
  },
  "sitespeed.io": {
    weight: 7,
    order: 7,
    baseMinutes: {
      smoke: 4,
      full: 10
    },
    summary: "Most extensive and heaviest here. Generates broader performance analysis and supporting artifacts."
  }
};

function getToolProfile(name, mode) {
  const profile = TOOL_PROFILES[name];
  return {
    order: profile.order,
    weight: profile.weight,
    estimatedMinutes: profile.baseMinutes[mode],
    summary: profile.summary
  };
}

function chooseTools(profile, mode) {
  return getAvailableTools().map((tool) => {
    let selected = false;
    let reason = tool.role;
    const toolProfile = getToolProfile(tool.name, mode);

    if (tool.name === "playwright") {
      selected = true;
      reason = "Selected as the default execution backbone for all interactive and cross-browser checks.";
    } else if (tool.name === "axe-core") {
      selected = true;
      reason = "Selected to fold accessibility checks into rendered page flows instead of running a separate silo.";
    } else if (tool.name === "lighthouse") {
      selected = true;
      reason = "Selected to add performance and quality budgets on key pages within the combined audit pipeline.";
    } else if (tool.name === "crawlee") {
      selected = mode === "full" || profile.needsDeepCrawl;
      reason = selected
        ? "Selected to discover routes, subpages, and internal links for broad coverage."
        : "Available, but not necessary when the run is limited to critical-path smoke coverage.";
    } else if (tool.name === "puppeteer") {
      selected = mode === "full" || profile.renderingMode === "mixed" || profile.likelyFrameworks.includes("Next.js");
      reason = selected
        ? "Selected for Chrome-specific instrumentation including JS/CSS coverage analysis."
        : "Available, but not needed unless Chrome-specific instrumentation becomes necessary.";
    } else if (tool.name === "selenium") {
      selected = mode === "full" || profile.needsCompatibilityFallback;
      reason = selected
        ? "Selected for cross-browser compatibility validation."
        : "Available, but held in reserve for legacy or remote-grid compatibility needs.";
    } else if (tool.name === "sitespeed.io") {
      selected = mode === "full";
      reason = selected
        ? "Selected to deepen performance profiling for the full run."
        : "Available, but deferred in smoke mode to keep runtime short.";
    }

    return {
      name: tool.name,
      role: tool.role,
      selected,
      reason,
      executionOrder: toolProfile.order,
      weight: toolProfile.weight,
      estimatedMinutes: toolProfile.estimatedMinutes,
      heavinessSummary: toolProfile.summary
    };
  });
}

function buildProcessSteps(profile, mode, selectedToolNames) {
  const steps = [];

  steps.push("Profile the target from the provided URL, SSH location, auth hints, and naming signals.");

  if (selectedToolNames.includes("crawlee")) {
    steps.push("Discover pages, subpages, and internal links first so later checks operate on one shared route inventory.");
  } else {
    steps.push("Start from the critical routes only to keep the run tight and release-oriented.");
  }

  steps.push("Execute browser journeys through Playwright across the required desktop and mobile browser projects.");
  steps.push("Collect console, request, response, layout, button, form, asset, and viewport signals during the same page flows.");
  steps.push("Run accessibility assertions inside rendered pages so accessibility is part of the same execution path.");
  steps.push("Apply Lighthouse to key routes and merge those quality signals into the same route-level assessment.");

  if (selectedToolNames.includes("sitespeed.io")) {
    steps.push("Expand full-mode performance profiling to detect slower pages and regression-prone templates.");
  }

  if (selectedToolNames.includes("puppeteer")) {
    steps.push("Add Chrome-specific instrumentation only where the detected stack benefits from deeper browser internals.");
  }

  if (profile.requiresAuth) {
    steps.push("Establish authenticated state once and reuse it across protected routes and critical flows.");
  }

  if (mode === "smoke") {
    steps.push("Gate the release on critical-path health rather than exhausting the full route tree.");
  } else {
    steps.push("Continue through the full route tree until core templates, linked pages, and high-risk interactions are covered.");
  }

  steps.push("Write one combined report that summarizes the audit process and findings by severity, not by tool.");

  return steps;
}

export function buildExecutionPlan(profile, mode) {
  const selectedTools = chooseTools(profile, mode).sort((left, right) => left.executionOrder - right.executionOrder);
  const selectedToolNames = selectedTools.filter((tool) => tool.selected).map((tool) => tool.name);
  const executionTimeline = selectedTools
    .filter((tool) => tool.selected)
    .map((tool) => ({
      toolName: tool.name,
      order: tool.executionOrder,
      estimatedMinutes: tool.estimatedMinutes,
      heavinessSummary: tool.heavinessSummary
    }));
  const totalEstimatedMinutes = executionTimeline.reduce((total, tool) => total + tool.estimatedMinutes, 0);

  return {
    mode,
    profileSummary:
      mode === "smoke"
        ? `Use a narrow critical-path audit for a ${profile.targetKind} target, with accessibility and quality checks embedded in the same user journeys.`
        : `Use a broad combined audit for a ${profile.targetKind} target, with discovery, functional checks, accessibility, and performance folded into one pipeline.`,
    selectedTools,
    processSteps: buildProcessSteps(profile, mode, selectedToolNames),
    executionTimeline,
    totalEstimatedMinutes
  };
}
