# Quality Tester — App Information

## Architecture Overview

The app follows a pipeline architecture:

```
CLI Input → Target Profiling → Enrichment → Orchestration → Execution → Reporting
```

Each stage feeds the next. No manual config files are needed — the app profiles the target and selects tools automatically.

## File Structure

```
quality_tester/
├── bin/
│   ├── qatester.mjs              # Main CLI entry point
│   └── lib/
│       ├── available-tools.mjs    # Tool registry (7 tools)
│       ├── target-profiler.mjs    # Target detection and live enrichment
│       ├── orchestration.mjs      # Execution plan builder and tool selection
│       ├── execution.mjs          # Core audit engine (all tool runners)
│       ├── reporting.mjs          # Report generators (full, ok, errors, PDF)
│       └── utils.mjs              # Helpers (URL, filesystem, command runner)
├── src/                           # TypeScript scaffold (future migration target)
│   ├── cli.ts                     # Type definitions
│   ├── types.ts                   # Core type system
│   └── [module]/README.md         # Per-module design notes
├── tests/
│   ├── smoke/                     # Playwright smoke test specs
│   └── full/                      # Playwright full test specs
├── config/                        # Future config management
├── docs/                          # Documentation
├── output/                        # Generated reports (one folder per run)
└── storage/                       # Crawlee internal state
```

## Detailed Flow and Process

### 1. CLI Input (`bin/qatester.mjs`)

The app starts with `npm run app`. It prompts the developer for 8 inputs via an interactive readline interface. No config files need to be edited.

### 2. Target Profiling (`bin/lib/target-profiler.mjs`)

**`profileTarget(run)`** — Pattern-matches the input strings (project name, URL, SSH path) to infer:
- Target kind: `website`, `web-app`, or `hybrid`
- Frameworks: Next.js, React, Express, NestJS
- CMS: WordPress, Payload CMS
- Rendering mode: `static`, `spa`, or `mixed`
- Whether auth is needed
- Whether deep crawl is useful

**`enrichTargetProfile(run, baseProfile)`** — Fetches the live URL and checks:
- HTML markers (Next.js data attributes, WordPress content paths, React root)
- Response headers (`x-powered-by`, etc.)
- Login/password form presence

### 3. Orchestration (`bin/lib/orchestration.mjs`)

**`buildExecutionPlan(profile, mode)`** — Selects tools based on the profile:

| Tool | Selection Rule |
|---|---|
| Playwright | Always selected |
| axe-core | Always selected |
| Lighthouse | Always selected |
| Crawlee | Selected if `needsDeepCrawl` (full mode or non-web-app) |
| sitespeed.io | Selected only in full mode |
| Puppeteer | Selected for mixed rendering or Next.js targets |
| Selenium | Reserved for compatibility fallback |

Each tool has a weight (1-7), estimated runtime per mode, and a heaviness summary. The execution plan orders tools from lightest to heaviest.

### 4. Execution (`bin/lib/execution.mjs`)

**`executeAuditPlan(run, profile, plan, runDir, onProgress)`**

Runs the selected tools in order. Each tool reports progress via callback as it completes.

#### Route Discovery
- **Crawlee path**: Uses `PlaywrightCrawler` to discover internal links. Limits: 10 routes (smoke), 50 routes (full).
- **Fallback path**: If Crawlee fails or is not selected, Playwright extracts `<a href>` links from the base URL.

#### Playwright + axe-core
- Launches real browsers (Chromium, Firefox, WebKit — desktop and mobile)
- Visits each discovered route
- Collects: console errors, failed requests, broken images, form/button counts, layout overflow
- Runs axe-core accessibility checks on each rendered page
- Captures full-page screenshots

#### Lighthouse
- Launches Chrome via `chrome-launcher`
- Audits 1 route (smoke) or 3 routes (full)
- Categories: performance, accessibility, best-practices, SEO
- Saves JSON reports

#### sitespeed.io (full mode only)
- Spawns the CLI tool via child process
- Generates waterfall reports and performance artifacts

#### Puppeteer (when selected)
- Launches headless Chrome
- Captures JS and CSS coverage metadata

#### Selenium (when selected)
- Launches Chrome via WebDriver
- Basic compatibility probe (title check)

### 5. Reporting (`bin/lib/reporting.mjs`)

Three report types are generated per run:

#### report-full.md
Everything — run config, target profile, tool chain, process steps, tool availability, status, progress log, execution summary, route coverage, all findings by severity, and artifact paths.

#### report-ok.md
Only routes and checks that passed with zero issues. Shows which routes had no console errors, no failed requests, no broken images, no layout overflow, no accessibility violations, and HTTP status < 400.

#### report-errors.md
Only error findings. Each error includes:
- Severity level (CRITICAL / HIGH / MEDIUM / LOW)
- URL where the issue was found
- Component/area (e.g., accessibility, network, assets, responsive-layout)
- Detailed description

Also lists all routes that had at least one issue with a breakdown of what went wrong.

#### report-full.pdf
A basic text-rendered PDF of the full report.

## Tool Chain Detail

### Weight and Estimated Runtimes

| # | Tool | Smoke | Full | Description |
|---|---|---|---|---|
| 1 | axe-core | ~0.5 min | ~1.5 min | Fastest — runs inside already-loaded pages |
| 2 | Crawlee | ~1.0 min | ~4.0 min | Light discovery layer |
| 3 | Lighthouse | ~2.0 min | ~5.0 min | Moderate — audits key routes |
| 4 | Playwright | ~3.0 min | ~8.0 min | Primary engine — drives real browsers |
| 5 | Puppeteer | ~2.0 min | ~4.0 min | Specialized Chrome instrumentation |
| 6 | Selenium | ~2.0 min | ~5.0 min | Compatibility-oriented fallback |
| 7 | sitespeed.io | ~4.0 min | ~10.0 min | Most extensive performance analysis |

### Selection Logic by Mode

**Smoke mode** typically selects: axe-core, Lighthouse, Playwright (3-4 tools).
Crawlee is added if the target is a website or hybrid (not a pure web-app).

**Full mode** adds: Crawlee (always), sitespeed.io (always), plus Puppeteer if the target uses Next.js or mixed rendering.

## Severity Model

| Level | Meaning |
|---|---|
| critical | Release-blocking or route-blocking failure |
| high | Major functional regression or major a11y/performance issue |
| medium | Important but non-blocking issue |
| low | Minor defect or improvement item |
| info | Observation and telemetry |

## Browser Matrix

| Project | Engine | Viewport |
|---|---|---|
| desktop-chromium | Chromium | Default desktop |
| desktop-firefox | Firefox | Default desktop (full mode) |
| desktop-webkit | WebKit/Safari | Default desktop (full mode) |
| mobile-chromium | Chromium | Pixel 7 (full mode) |
| mobile-webkit | WebKit | iPhone 14 |

Smoke mode uses desktop-chromium and mobile-webkit. Full mode uses all 5.

## Output Structure

Each run creates a timestamped folder:

```
output/2026-04-12T03-00-00-000Z-myproject-smoke/
├── report-full.md        # Complete report
├── report-ok.md          # Passed checks only
├── report-errors.md      # Errors only with URLs and components
├── report-full.pdf       # PDF version
├── screenshots/          # Full-page screenshots per browser per route
├── lighthouse/           # Lighthouse JSON reports
├── sitespeed/            # sitespeed.io artifacts (full mode)
├── crawlee-storage/      # Crawlee internal data
├── puppeteer-probe.json  # Coverage metadata (when selected)
└── selenium-probe.json   # Compatibility data (when selected)
```
