# Quality Tester

Automated quality testing CLI for websites and web apps. Profiles the target, selects the right tools, runs audits, and produces reports — all from one command.

Supports **React, Next.js, Payload CMS, WordPress, NestJS, Express, and static sites.**

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install browser engines (Chromium, Firefox, WebKit)
npm run install:browsers

# 3. Run the tester
npm run app
```

The CLI will ask you **5 questions**, then run the audit.

---

## The 5 Questions

| # | Prompt | Example |
|---|---|---|
| 1 | Project name | `essentialbali` |
| 2 | URL to test | `http://example.com` |
| 3 | SSH command | `ssh azlan@gda-s01` |
| 4 | Server project path | `/var/www/mysite` |
| 5 | Mode | `smoke` or `full` |

---

## Modes

| Mode | Time | What it does |
|---|---|---|
| **smoke** | 3-7 min | Fast release gate — critical routes, console errors, broken assets, a11y, Lighthouse |
| **full** | 15-35 min | Deep crawl — all routes, all 7 tools, including sitespeed.io performance profiling |

---

## Tools

The tester wires together 7 audit tools:

| Tool | Role |
|---|---|
| [Playwright](https://playwright.dev) | Cross-browser automation (Chromium, Firefox, WebKit) |
| [axe-core](https://github.com/dequelabs/axe-core) | Accessibility (WCAG) |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Performance, SEO, best practices |
| [Crawlee](https://crawlee.dev) | Route discovery and crawling |
| [sitespeed.io](https://www.sitespeed.io) | Extended performance profiling (full mode only) |
| [Puppeteer](https://pptr.dev) | Chrome-specific diagnostics (JS/CSS coverage) |
| [Selenium](https://www.selenium.dev) | Compatibility fallback |

---

## Output

Each run creates a timestamped folder in `output/`, e.g. `output/2026-04-18T14-30-00-000Z-mysite-smoke/`:

- **6 Markdown reports** — full, ok-only, errors-only, plus plain-language versions of each
- **1 PDF report** — full report as PDF
- **Screenshots** — per browser × per route
- **Lighthouse JSON** — raw audit data per route
- **sitespeed.io artifacts** — waterfall + performance (full mode only)

See [`docs/architecture.md`](docs/architecture.md) for the complete output file list.

---

## Documentation

Detailed docs live in [`docs/`](docs/):

| File | What it covers |
|---|---|
| [`architecture.md`](docs/architecture.md) | File structure, pipeline flow, and every output file the app generates |
| [`app_information.md`](docs/app_information.md) | Runtime flow, tool selection logic, browser matrix, severity model |
| [`test-strategy.md`](docs/test-strategy.md) | Testing strategy, coverage areas, delivery phases |
| [`bootstrap-structure.md`](docs/bootstrap-structure.md) | Original scaffold plan (historical reference) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 20 (ESM) |
| Language | JavaScript (ES2022) |
| Browser Engines | Chromium, Firefox, WebKit (via Playwright) |
| Package Manager | npm |
