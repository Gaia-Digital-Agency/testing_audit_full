import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { absoluteUrl, dedupeStrings, runCommand, sameOrigin } from "./utils.mjs";

function makeFinding(severity, area, title, details, route, source) {
  return { severity, area, title, details, route, browser: null, source: source || null };
}

function makeBrowserFinding(severity, area, title, details, route, browser, source) {
  return { severity, area, title, details, route, browser, source: source || null };
}

async function discoverRoutesWithPlaywright(playwright, run, profile) {
  const browser = await playwright.chromium.launch({ headless: true });
  const contextOptions = {};

  if (run.authUser && run.authPassword) {
    contextOptions.httpCredentials = {
      username: run.authUser,
      password: run.authPassword
    };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const routes = new Set([run.baseUrl]);

  try {
    await page.goto(run.baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const hrefs = await page.$$eval("a[href]", (elements) => elements.map((element) => element.getAttribute("href") || ""));

    for (const href of hrefs) {
      const absolute = absoluteUrl(run.baseUrl, href);
      if (absolute && sameOrigin(run.baseUrl, absolute)) {
        routes.add(absolute);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const routeList = [...routes].slice(0, profile.needsDeepCrawl ? 50 : 5);
  return routeList;
}

async function discoverRoutesWithCrawlee(run, runDir) {
  const { PlaywrightCrawler, Dataset } = await import("crawlee");
  const storageDir = path.join(runDir, "crawlee-storage");
  await mkdir(storageDir, { recursive: true });

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: run.mode === "full" ? 50 : 10,
    launchContext: {
      launchOptions: {
        headless: true
      }
    },
    requestHandlerTimeoutSecs: 45,
    async requestHandler({ request, page, enqueueLinks }) {
      await Dataset.pushData({
        url: request.loadedUrl ?? request.url,
        title: await page.title()
      });

      await enqueueLinks({
        strategy: "same-hostname"
      });
    }
  });

  await crawler.run([run.baseUrl]);
  const dataset = await Dataset.open();
  const items = await dataset.getData();
  return dedupeStrings(items.items.map((item) => item.url)).slice(0, run.mode === "full" ? 50 : 10);
}

async function maybePerformLogin(page, run, combined) {
  if (!run.authUser || !run.authPassword) {
    return { attempted: false, succeeded: false };
  }

  const passwordInput = page.locator('input[type="password"]').first();
  const passwordVisible = await passwordInput.isVisible().catch(() => false);

  if (!passwordVisible) {
    return { attempted: false, succeeded: false };
  }

  const emailSelectors = [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[name*="user" i]',
    'input[name*="login" i]',
    'input[type="text"]'
  ];

  for (const selector of emailSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(run.authUser).catch(() => {});
      break;
    }
  }

  await passwordInput.fill(run.authPassword).catch(() => {});

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Login")',
    'button:has-text("Log in")',
    'button:has-text("Sign in")'
  ];

  for (const selector of submitSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await Promise.allSettled([
        page.waitForLoadState("networkidle", { timeout: 15_000 }),
        locator.click()
      ]);
      break;
    }
  }

  const currentUrl = page.url();
  const stillOnLogin = /login|sign[- ]?in/i.test(currentUrl);
  if (stillOnLogin) {
    combined.findings.push(
      makeFinding(
        "medium",
        "authentication",
        "Login flow may still require a project-specific selector strategy",
        "Credentials were provided and a generic login attempt was made, but the page still looks like an auth route.",
        currentUrl
      )
    );
  }

  return { attempted: true, succeeded: !stillOnLogin };
}

async function runPlaywrightAndAxe(run, profile, selectedTools, runDir, routes) {
  const playwright = await import("playwright");
  const { AxeBuilder } = await import("@axe-core/playwright");
  const screenshotsDir = path.join(runDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const projects = run.mode === "full"
    ? [
        { name: "desktop-chromium", type: playwright.chromium, context: {} },
        { name: "desktop-firefox", type: playwright.firefox, context: {} },
        { name: "desktop-webkit", type: playwright.webkit, context: {} },
        { name: "mobile-chromium", type: playwright.chromium, context: { ...playwright.devices["Pixel 7"] } },
        { name: "mobile-webkit", type: playwright.webkit, context: { ...playwright.devices["iPhone 14"] } }
      ]
    : [
        { name: "desktop-chromium", type: playwright.chromium, context: {} },
        { name: "mobile-webkit", type: playwright.webkit, context: { ...playwright.devices["iPhone 14"] } }
      ];

  const combined = {
    findings: [],
    routeSummaries: [],
    artifacts: [],
    metrics: {
      pagesVisited: 0,
      consoleErrors: 0,
      failedRequests: 0,
      accessibilityViolations: 0,
      brokenImages: 0,
      formsDetected: 0,
      buttonsDetected: 0
    }
  };

  for (const project of projects) {
    const browser = await project.type.launch({ headless: true });
    const contextOptions = { ...project.context };

    if (run.authUser && run.authPassword) {
      contextOptions.httpCredentials = {
        username: run.authUser,
        password: run.authPassword
      };
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(run.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000
    }).catch(() => {});
    const loginState = await maybePerformLogin(page, run, combined);

    for (const route of routes) {
      const consoleErrors = [];
      const failedRequests = [];

      page.removeAllListeners("console");
      page.removeAllListeners("requestfailed");

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      page.on("requestfailed", (request) => {
        failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`);
      });

      let responseStatus = null;
      let title = "";
      let formCount = 0;
      let buttonCount = 0;
      let brokenImages = 0;
      let brokenImageDetails = [];
      let hasHorizontalOverflow = false;
      let accessibilityViolations = 0;

      try {
        const response = await page.goto(route, {
          waitUntil: "networkidle",
          timeout: 60_000
        });
        responseStatus = response?.status() ?? null;
        title = await page.title();
        formCount = await page.locator("form").count();
        buttonCount = await page.locator("button, input[type='submit'], input[type='button']").count();
        const brokenImageDetails = await page.$$eval("img", (images) =>
          images
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .slice(0, 10)
            .map((image) => ({
              src: image.src || image.getAttribute("src") || "(empty)",
              alt: image.alt || "(no alt)",
              selector: image.id ? `#${image.id}` : image.className ? `img.${image.className.split(" ")[0]}` : `img[src="${(image.getAttribute("src") || "").slice(0, 80)}"]`
            }))
        );
        brokenImages = brokenImageDetails.length;
        hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

        if (selectedTools.includes("axe-core")) {
          const axeResult = await new AxeBuilder({ page }).analyze();
          accessibilityViolations = axeResult.violations.length;

          for (const violation of axeResult.violations) {
            const nodes = violation.nodes.slice(0, 5).map((node) => ({
              selector: node.target.join(" > "),
              html: (node.html || "").slice(0, 200),
              failureSummary: (node.failureSummary || "").slice(0, 200)
            }));
            combined.findings.push(
              makeBrowserFinding(
                violation.impact === "critical" ? "critical" : violation.impact === "serious" ? "high" : "medium",
                "accessibility",
                `${violation.id}: ${violation.help}`,
                violation.description,
                route,
                project.name,
                {
                  type: "axe-rule",
                  ruleId: violation.id,
                  impact: violation.impact,
                  wcagTags: violation.tags.filter((t) => t.startsWith("wcag") || t.startsWith("best-practice")),
                  helpUrl: violation.helpUrl,
                  nodes
                }
              )
            );
          }
        }

        const screenshotName = `${project.name}-${routes.indexOf(route) + 1}.png`;
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        combined.artifacts.push(screenshotPath);
      } catch (error) {
        combined.findings.push(
          makeFinding(
            "critical",
            "availability",
            "Route could not be loaded",
            error instanceof Error ? error.message : String(error),
            route
          )
        );
      }

      combined.metrics.pagesVisited += 1;
      combined.metrics.consoleErrors += consoleErrors.length;
      combined.metrics.failedRequests += failedRequests.length;
      combined.metrics.accessibilityViolations += accessibilityViolations;
      combined.metrics.brokenImages += brokenImages;
      combined.metrics.formsDetected += formCount;
      combined.metrics.buttonsDetected += buttonCount;

      if (responseStatus && responseStatus >= 400) {
        combined.findings.push(
          makeBrowserFinding("critical", "availability", "Route returned an error status", `HTTP ${responseStatus}`, route, project.name, {
            type: "http-error",
            statusCode: responseStatus
          })
        );
      }

      if (consoleErrors.length > 0) {
        for (const errorText of consoleErrors.slice(0, 10)) {
          combined.findings.push(
            makeBrowserFinding("high", "runtime", "Console error", errorText.slice(0, 500), route, project.name, {
              type: "console-error",
              message: errorText.slice(0, 500)
            })
          );
        }
      }

      if (failedRequests.length > 0) {
        for (const reqDetail of failedRequests.slice(0, 10)) {
          combined.findings.push(
            makeBrowserFinding("high", "network", "Failed network request", reqDetail, route, project.name, {
              type: "network-failure",
              request: reqDetail
            })
          );
        }
      }

      if (brokenImageDetails.length > 0) {
        for (const img of brokenImageDetails.slice(0, 10)) {
          combined.findings.push(
            makeBrowserFinding("medium", "assets", "Broken image", `Image failed to load: ${img.src}`, route, project.name, {
              type: "broken-image",
              selector: img.selector,
              src: img.src,
              alt: img.alt
            })
          );
        }
      }

      if (hasHorizontalOverflow) {
        combined.findings.push(
          makeBrowserFinding("medium", "responsive-layout", "Horizontal overflow detected", "The page width exceeds the viewport, which often indicates layout breakage.", route, project.name, {
            type: "layout-overflow",
            scrollWidth: null,
            viewportWidth: null
          })
        );
      }

      combined.routeSummaries.push({
        route,
        browserProject: project.name,
        title,
        responseStatus,
        consoleErrors: consoleErrors.length,
        failedRequests: failedRequests.length,
        forms: formCount,
        buttons: buttonCount,
        brokenImages,
        horizontalOverflow: hasHorizontalOverflow,
        accessibilityViolations,
        loginAttempted: loginState.attempted,
        loginSucceeded: loginState.succeeded
      });
    }

    await context.close();
    await browser.close();
  }

  return combined;
}

async function runLighthouseAudit(run, runDir, routes) {
  const { launch } = await import("chrome-launcher");
  const lighthouse = (await import("lighthouse")).default;
  const reportsDir = path.join(runDir, "lighthouse");
  await mkdir(reportsDir, { recursive: true });
  const keyRoutes = routes.slice(0, run.mode === "full" ? 3 : 1);
  const findings = [];
  const summaries = [];

  for (const route of keyRoutes) {
    let chrome;
    try {
      chrome = await launch({
        chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"]
      });

      const result = await lighthouse(route, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
      });

      const lhr = result.lhr;
      const outputPath = path.join(reportsDir, `${sanitizeForFilename(route)}.lighthouse.json`);
      await writeFile(outputPath, result.report, "utf8");

      const performance = Math.round((lhr.categories.performance?.score ?? 0) * 100);
      const accessibility = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);
      const bestPractices = Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100);
      const seo = Math.round((lhr.categories.seo?.score ?? 0) * 100);

      summaries.push({
        route,
        performance,
        accessibility,
        bestPractices,
        seo,
        reportPath: outputPath
      });

      if (performance < 50) {
        findings.push(makeFinding("high", "performance", "Performance score is weak on a key route", `Lighthouse performance score was ${performance}.`, route));
      }

      if (accessibility < 70) {
        findings.push(makeFinding("medium", "accessibility", "Accessibility score is below target", `Lighthouse accessibility score was ${accessibility}.`, route));
      }
    } catch (error) {
      findings.push(
        makeFinding(
          "medium",
          "performance",
          "Lighthouse audit could not be completed",
          error instanceof Error ? error.message : String(error),
          route
        )
      );
    } finally {
      if (chrome) {
        await chrome.kill();
      }
    }
  }

  return { findings, summaries, artifacts: summaries.map((summary) => summary.reportPath) };
}

async function runSitespeedAudit(run, runDir) {
  const sitespeedDir = path.join(runDir, "sitespeed");
  await mkdir(sitespeedDir, { recursive: true });

  const result = await runCommand(
    "npx",
    [
      "sitespeed.io",
      "--outputFolder",
      sitespeedDir,
      "--browsertime.iterations",
      "1",
      "--html.showAllWaterfallSummary",
      "false",
      run.baseUrl
    ],
    { cwd: process.cwd() }
  );

  if (!result.ok) {
    return {
      findings: [
        makeFinding(
          "low",
          "performance",
          "sitespeed.io did not complete",
          result.error || result.stderr || "sitespeed.io exited unsuccessfully.",
          run.baseUrl
        )
      ],
      artifacts: [],
      note: null
    };
  }

  return {
    findings: [],
    artifacts: [sitespeedDir],
    note: "sitespeed.io profiling completed and its artifact folder was captured."
  };
}

async function runPuppeteerProbe(run, runDir) {
  const puppeteer = await import("puppeteer");
  const artifactPath = path.join(runDir, "puppeteer-probe.json");
  let browser;

  try {
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.goto(run.baseUrl, { waitUntil: "networkidle2", timeout: 60_000 });
    await Promise.all([page.coverage.startJSCoverage(), page.coverage.startCSSCoverage()]);
    await page.reload({ waitUntil: "networkidle2" });
    const [jsCoverage, cssCoverage] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);

    const summary = {
      url: run.baseUrl,
      jsEntries: jsCoverage.length,
      cssEntries: cssCoverage.length
    };
    await writeFile(artifactPath, JSON.stringify(summary, null, 2), "utf8");

    return {
      findings: [],
      artifacts: [artifactPath],
      note: `Puppeteer captured Chrome-specific coverage metadata (${summary.jsEntries} JS entries, ${summary.cssEntries} CSS entries).`
    };
  } catch (error) {
    return {
      findings: [
        makeFinding(
          "low",
          "runtime",
          "Puppeteer probe did not complete",
          error instanceof Error ? error.message : String(error),
          run.baseUrl
        )
      ],
      artifacts: [],
      note: null
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function runSeleniumProbe(run, runDir) {
  const selenium = await import("selenium-webdriver");
  const artifactPath = path.join(runDir, "selenium-probe.json");
  let driver;

  try {
    driver = await new selenium.Builder().forBrowser(selenium.Browser.CHROME).build();
    await driver.get(run.baseUrl);
    const title = await driver.getTitle();
    await writeFile(artifactPath, JSON.stringify({ url: run.baseUrl, title }, null, 2), "utf8");
    return {
      findings: [],
      artifacts: [artifactPath],
      note: "Selenium compatibility probe completed."
    };
  } catch (error) {
    return {
      findings: [
        makeFinding(
          "low",
          "compatibility",
          "Selenium compatibility probe did not complete",
          error instanceof Error ? error.message : String(error),
          run.baseUrl
        )
      ],
      artifacts: [],
      note: null
    };
  } finally {
    if (driver) {
      await driver.quit().catch(() => {});
    }
  }
}

function sanitizeForFilename(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "route";
}

export async function executeAuditPlan(run, profile, executionPlan, runDir, onProgress) {
  const selectedTools = executionPlan.selectedTools.filter((tool) => tool.selected).map((tool) => tool.name);
  const progressEvents = [];
  const markProgress = (toolName, status, detail, startedAt) => {
    const finishedAt = new Date();
    const elapsedMs = startedAt ? finishedAt.getTime() - startedAt.getTime() : 0;
    const event = {
      toolName,
      status,
      detail,
      finishedAt: finishedAt.toISOString(),
      elapsedSeconds: Math.max(0, Math.round(elapsedMs / 1000))
    };
    progressEvents.push(event);
    if (onProgress) onProgress(event);
  };
  const result = {
    findings: [],
    notes: [],
    artifacts: [],
    routesDiscovered: [],
    routeSummaries: [],
    progressEvents,
    metrics: {
      pagesVisited: 0,
      routesDiscovered: 0,
      consoleErrors: 0,
      failedRequests: 0,
      accessibilityViolations: 0,
      brokenImages: 0
    }
  };

  let routes = [run.baseUrl];
  const playwright = await import("playwright");

  if (selectedTools.includes("crawlee")) {
    const startedAt = new Date();
    try {
      routes = await discoverRoutesWithCrawlee(run, runDir);
      result.notes.push(`Crawlee discovered ${routes.length} route(s) for combined coverage.`);
      markProgress("crawlee", "completed", `Discovered ${routes.length} route(s).`, startedAt);
    } catch (error) {
      routes = await discoverRoutesWithPlaywright(playwright, run, profile);
      result.notes.push(
        `Crawlee discovery fell back to a Playwright-based route pass: ${error instanceof Error ? error.message : String(error)}`
      );
      markProgress("crawlee", "degraded", "Crawlee failed, so route discovery fell back to Playwright.", startedAt);
    }
  } else {
    const startedAt = new Date();
    routes = await discoverRoutesWithPlaywright(playwright, run, profile);
    result.notes.push(`Playwright discovered ${routes.length} route(s) for smoke coverage.`);
    markProgress("playwright", "completed", `Discovered and covered ${routes.length} route(s) in the light smoke pass.`, startedAt);
  }

  result.routesDiscovered = routes;
  result.metrics.routesDiscovered = routes.length;

  const playStartedAt = new Date();
  const playResult = await runPlaywrightAndAxe(run, profile, selectedTools, runDir, routes);
  result.findings.push(...playResult.findings);
  result.routeSummaries.push(...playResult.routeSummaries);
  result.artifacts.push(...playResult.artifacts);
  result.metrics.pagesVisited += playResult.metrics.pagesVisited;
  result.metrics.consoleErrors += playResult.metrics.consoleErrors;
  result.metrics.failedRequests += playResult.metrics.failedRequests;
  result.metrics.accessibilityViolations += playResult.metrics.accessibilityViolations;
  result.metrics.brokenImages += playResult.metrics.brokenImages;
  markProgress(
    "playwright",
    "completed",
    `Visited ${playResult.metrics.pagesVisited} page instance(s) across the selected browser projects.`,
    playStartedAt
  );

  if (selectedTools.includes("axe-core")) {
    markProgress(
      "axe-core",
      "completed",
      `Captured ${playResult.metrics.accessibilityViolations} accessibility violation(s) during page execution.`,
      playStartedAt
    );
  }

  if (selectedTools.includes("lighthouse")) {
    const startedAt = new Date();
    const lighthouseResult = await runLighthouseAudit(run, runDir, routes);
    result.findings.push(...lighthouseResult.findings);
    result.artifacts.push(...lighthouseResult.artifacts);
    result.notes.push(`Lighthouse evaluated ${lighthouseResult.summaries.length} key route(s).`);
    markProgress("lighthouse", "completed", `Evaluated ${lighthouseResult.summaries.length} key route(s).`, startedAt);
  }

  if (selectedTools.includes("sitespeed.io")) {
    const startedAt = new Date();
    const sitespeedResult = await runSitespeedAudit(run, runDir);
    result.findings.push(...sitespeedResult.findings);
    result.artifacts.push(...sitespeedResult.artifacts);
    if (sitespeedResult.note) {
      result.notes.push(sitespeedResult.note);
    }
    markProgress(
      "sitespeed.io",
      sitespeedResult.findings.length > 0 ? "degraded" : "completed",
      sitespeedResult.findings.length > 0 ? "Performance profiling ended with runtime issues." : "Performance profiling completed.",
      startedAt
    );
  }

  if (selectedTools.includes("puppeteer")) {
    const startedAt = new Date();
    const puppeteerResult = await runPuppeteerProbe(run, runDir);
    result.findings.push(...puppeteerResult.findings);
    result.artifacts.push(...puppeteerResult.artifacts);
    if (puppeteerResult.note) {
      result.notes.push(puppeteerResult.note);
    }
    markProgress(
      "puppeteer",
      puppeteerResult.findings.length > 0 ? "degraded" : "completed",
      puppeteerResult.note || "Puppeteer probe ended with runtime issues.",
      startedAt
    );
  }

  if (selectedTools.includes("selenium")) {
    const startedAt = new Date();
    const seleniumResult = await runSeleniumProbe(run, runDir);
    result.findings.push(...seleniumResult.findings);
    result.artifacts.push(...seleniumResult.artifacts);
    if (seleniumResult.note) {
      result.notes.push(seleniumResult.note);
    }
    markProgress(
      "selenium",
      seleniumResult.findings.length > 0 ? "degraded" : "completed",
      seleniumResult.note || "Selenium compatibility probe ended with runtime issues.",
      startedAt
    );
  }

  return result;
}
