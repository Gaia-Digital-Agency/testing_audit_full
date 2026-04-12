# Quality Tester

Automated quality testing CLI for websites and web apps. Profiles the target, selects the right tool combination, runs audits, and produces reports — all from one command.

Supports React, Next.js, Payload CMS, WordPress, NestJS, Express, and static sites.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 20 (ESM) |
| Language | JavaScript (ES2022) with TypeScript scaffold |
| Browser Engines | Chromium, Firefox, WebKit (via Playwright) |
| Package Manager | npm |

## Tools Used

| Tool | Purpose |
|---|---|
| [Playwright](https://playwright.dev) | Cross-browser automation — drives Chromium, Firefox, and WebKit across desktop and mobile viewports |
| [axe-core](https://github.com/dequelabs/axe-core) | Accessibility auditing — WCAG rule checks embedded inside rendered page flows |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Quality scoring — performance, accessibility, best practices, and SEO budgets |
| [Crawlee](https://crawlee.dev) | Route discovery — recursive crawling, sitemap ingestion, internal link traversal |
| [sitespeed.io](https://www.sitespeed.io) | Performance profiling — waterfall analysis, regression detection, extended metrics |
| [Puppeteer](https://pptr.dev) | Chrome-specific instrumentation — JS/CSS coverage, CDP-level diagnostics |
| [Selenium](https://www.selenium.dev) | Compatibility fallback — remote grid and legacy browser support |
| [chrome-launcher](https://github.com/AuxinJeron/chrome-launcher) | Chrome process management for Lighthouse audits |

## Quick Start

```bash
# Install dependencies
npm install

# Install browser engines (Chromium, Firefox, WebKit)
npm run install:browsers

# Run the tester
npm run app
```

## Input

When you run `npm run app`, the CLI presents:

```
═════════════════════════════════════════════════════���══
  QUALITY TESTER — Run Configuration
══════════════════════���═════════════════════════════════

  Project name:              → Label for the run and report folder
  External URL:              → Public URL of the target site (e.g. https://example.com)
  SSH host:                  → Server hostname
  SSH user:                  → SSH username
  SSH project path:          → Path to project on the server
  Auth username (optional):  → For sites behind login (leave blank to skip)
  Auth password (optional):  → For sites behind login (leave blank to skip)
  Mode (smoke/full):         → smoke = fast release gate, full = deep crawl audit
```

| Prompt | Required | Description |
|---|---|---|
| Project name | Yes | Label for the run and report folder |
| External URL | Yes | Public URL of the target site |
| SSH host | Yes | Server hostname |
| SSH user | Yes | SSH username |
| SSH project path | Yes | Path to project on the server |
| Auth username | No | For sites behind login |
| Auth password | No | For sites behind login |
| Mode | Yes | `smoke` (fast) or `full` (deep) |

## Modes

- **smoke** — Fast release gate. Checks critical routes, console errors, broken assets, accessibility, and Lighthouse scores. Runs in ~3-7 minutes.
- **full** — Deep crawl and audit. Discovers all routes, runs all 7 tools including sitespeed.io performance profiling. Runs in ~15-35 minutes.

## Tool Chain (lightest to heaviest)

| # | Tool | Weight | Role |
|---|---|---|---|
| 1 | axe-core | Lightest | Accessibility rules inside page flows |
| 2 | Crawlee | Light | Route discovery and crawling |
| 3 | Lighthouse | Moderate | Performance, SEO, best practices |
| 4 | Playwright | Medium | Cross-browser automation backbone |
| 5 | Puppeteer | Moderate-heavy | Chrome-specific instrumentation |
| 6 | Selenium | Heavy | Compatibility fallback |
| 7 | sitespeed.io | Heaviest | Extended performance profiling |

## Output

Each run creates a timestamped folder in `output/` (e.g. `output/2026-04-12T03-00-00-000Z-myproject-smoke/`):

| File | What it contains |
|---|---|
| `report-full.md` | Complete report — run config, target profile, tool chain used, process steps, progress log, execution metrics, route-by-route coverage, all findings sorted by severity, and artifact paths |
| `report-ok.md` | Passed-only view — lists every route and check that completed with zero issues (no console errors, no failed requests, no broken images, no layout overflow, no accessibility violations, HTTP < 400) |
| `report-errors.md` | Errors-only view — each finding with severity (CRITICAL/HIGH/MEDIUM/LOW), the URL where it was found, the component/area affected, and a description of the issue |
| `report-full.pdf` | PDF version of the full report |
| `screenshots/` | Full-page screenshots captured per browser engine per route |
| `lighthouse/` | Raw Lighthouse JSON reports per audited route |
| `sitespeed/` | sitespeed.io waterfall and performance artifacts (full mode only) |

## More Information

See [`docs/app_information.md`](docs/app_information.md) for architecture, file structure, detailed flow, and tool selection logic.
