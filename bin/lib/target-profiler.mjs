function lower(value) {
  return value.trim().toLowerCase();
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

export function profileTarget(run) {
  const joined = [
    run.projectName,
    run.baseUrl,
    run.sshHost,
    run.sshUser,
    run.sshProjectPath
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const signals = [];
  const likelyFrameworks = [];
  const likelyCms = [];

  if (includesAny(joined, ["wordpress", "wp-content", "wp-admin", "/wp"])) {
    likelyCms.push("WordPress");
    signals.push("WordPress-like path or naming pattern detected");
  }

  if (includesAny(joined, ["next", "_next", "nextjs"])) {
    likelyFrameworks.push("Next.js");
    signals.push("Next.js-like naming pattern detected");
  }

  if (includesAny(joined, ["react"])) {
    likelyFrameworks.push("React");
    signals.push("React-like naming pattern detected");
  }

  if (includesAny(joined, ["payload"])) {
    likelyCms.push("Payload CMS");
    likelyFrameworks.push("Next.js");
    signals.push("Payload CMS-like naming pattern detected");
  }

  if (includesAny(joined, ["nest"])) {
    likelyFrameworks.push("NestJS");
    signals.push("NestJS-like naming pattern detected");
  }

  if (includesAny(joined, ["express"])) {
    likelyFrameworks.push("Express");
    signals.push("Express-like naming pattern detected");
  }

  if (includesAny(joined, ["login", "auth", "dashboard", "admin"]) || Boolean(run.authUser)) {
    signals.push("Authenticated flow likely present");
  }

  const requiresAuth = Boolean(run.authUser || run.authPassword) || includesAny(joined, ["login", "auth", "dashboard", "admin"]);
  const hasCms = likelyCms.length > 0;
  const hasAppSignals = includesAny(joined, ["app", "dashboard", "portal", "admin", "react", "next", "payload"]);
  const targetKind = hasCms ? "hybrid" : hasAppSignals ? "web-app" : "website";
  const renderingMode = likelyFrameworks.includes("Next.js")
    ? "mixed"
    : targetKind === "web-app"
      ? "spa"
      : "static";

  if (targetKind !== "web-app") {
    signals.push("Broad crawl coverage is likely useful");
  }

  if (run.mode === "full") {
    signals.push("Full mode requires breadth-first route discovery");
  }

  return {
    targetKind,
    likelyFrameworks: [...new Set(likelyFrameworks)],
    likelyCms: [...new Set(likelyCms)],
    renderingMode,
    requiresAuth,
    needsDeepCrawl: run.mode === "full" || targetKind !== "web-app",
    needsCompatibilityFallback: false,
    signals
  };
}

export async function enrichTargetProfile(run, baseProfile) {
  const profile = {
    ...baseProfile,
    likelyFrameworks: [...baseProfile.likelyFrameworks],
    likelyCms: [...baseProfile.likelyCms],
    signals: [...baseProfile.signals]
  };

  try {
    const response = await fetch(run.baseUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "quality-tester/0.1"
      }
    });

    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const lowerHtml = lower(html);
    const headerText = lower(JSON.stringify(headers));

    if (includesAny(lowerHtml, ["__next", "/_next/", "next-route-announcer"]) || includesAny(headerText, ["nextjs"])) {
      profile.likelyFrameworks.push("Next.js");
      profile.renderingMode = "mixed";
      profile.signals.push("Live HTML or headers expose Next.js markers");
    }

    if (includesAny(lowerHtml, ["wp-content", "wp-includes", "wordpress"])) {
      profile.likelyCms.push("WordPress");
      profile.signals.push("Live HTML exposes WordPress markers");
    }

    if (includesAny(lowerHtml, ["payload", "payloadcms"])) {
      profile.likelyCms.push("Payload CMS");
      profile.signals.push("Live HTML exposes Payload CMS markers");
    }

    if (includesAny(lowerHtml, ["reactroot", "__react", "data-reactroot"])) {
      profile.likelyFrameworks.push("React");
      profile.signals.push("Live HTML exposes React markers");
    }

    if (includesAny(lowerHtml, ["login", "password", "sign in", "signin", "log in"])) {
      profile.requiresAuth = profile.requiresAuth || Boolean(run.authUser || run.authPassword);
      profile.signals.push("Live page suggests an authenticated flow");
    }

    if ((headers["x-powered-by"] || "").toLowerCase().includes("express")) {
      profile.likelyFrameworks.push("Express");
      profile.signals.push("Response headers expose Express");
    }

    profile.likelyFrameworks = [...new Set(profile.likelyFrameworks)];
    profile.likelyCms = [...new Set(profile.likelyCms)];
  } catch (error) {
    profile.signals.push(`Live target profiling failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return profile;
}
