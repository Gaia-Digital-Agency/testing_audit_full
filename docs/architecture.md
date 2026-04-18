# Architecture

## App File Structure

```
quality_tester/
├── README.md                     Entry point — what the app is, how to run it
├── .gitignore
├── package.json                  npm scripts + dependencies
├── package-lock.json
├── tsconfig.json                 TypeScript config (for tests folder)
│
├── bin/                          ★ Working code (ES modules)
│   ├── qatester.mjs              CLI entry — asks 5 questions, runs the pipeline
│   └── lib/
│       ├── available-tools.mjs   Tool registry (7 tools + metadata)
│       ├── target-profiler.mjs   Detects stack: Next.js, WordPress, Payload, etc.
│       ├── orchestration.mjs     Selects which tools to run per mode/profile
│       ├── execution.mjs         All 7 tool runners (Playwright, axe, Lighthouse, …)
│       ├── reporting.mjs         Generates markdown + PDF reports
│       └── utils.mjs             URL parsing, filesystem, shell command helpers
│
├── tests/                        Playwright test specs
│   ├── playwright.config.ts      Playwright config (5 browser projects)
│   ├── smoke/
│   │   └── critical-path.spec.ts
│   └── full/
│       └── crawl-health.spec.ts
│
├── docs/
│   ├── architecture.md           THIS FILE — structure, flow, outputs
│   ├── app_information.md        Runtime details, tool selection logic
│   ├── test-strategy.md          Testing strategy and coverage areas
│   └── bootstrap-structure.md    Original scaffold plan (historical)
│
├── output/                       Timestamped run folders (generated)
├── storage/                      Crawlee crawler state (generated)
└── node_modules/                 Dependencies (generated)
```

## Pipeline Flow

```
CLI Input (5 questions)
    ↓
Target Profiling       (detect Next.js, WordPress, Payload, React, etc.)
    ↓
Live Enrichment        (fetch URL, scan headers + HTML markers)
    ↓
Orchestration          (pick tools based on profile + mode)
    ↓
Execution              (run tools lightest → heaviest, with progress reporting)
    ↓
Reporting              (markdown + PDF + screenshots + JSON artifacts)
```

## Output Files

Every run writes to `output/{timestamp}-{project}-{mode}/`.

Example: `output/2026-04-18T14-30-00-000Z-essentialbali-smoke/`

### Markdown Reports (always generated)

| File | Audience | Content |
|---|---|---|
| `report-full.md` | Engineers | Complete report — run config, target profile, tool chain, process steps, progress log, execution metrics, route coverage, all findings by severity, artifact paths |
| `report-ok.md` | Engineers | Passed-only — every route/check that completed with zero issues |
| `report-errors.md` | Engineers | Errors-only — severity (CRITICAL/HIGH/MEDIUM/LOW), URL, affected area, description |
| `report-easyread.md` | Non-technical | Plain-language summary of the full report |
| `report-easyread-good.md` | Non-technical | Plain-language summary of what passed |
| `report-easyread-errors.md` | Non-technical | Plain-language summary of what failed |

### PDF Reports

| File | Content |
|---|---|
| `report-full.pdf` | PDF version of `report-full.md` |

### Artifact Folders

| Folder | Content | When |
|---|---|---|
| `screenshots/` | PNG — full-page screenshots per browser engine per route | Always |
| `lighthouse/` | JSON — Lighthouse audit results (1 route smoke, 3 routes full) | Always |
| `sitespeed/` | HTML/JSON/images — waterfall + extended performance artifacts | Full mode only |
| `crawlee-storage/` | JSON — internal Crawlee state + discovered URLs | When Crawlee selected |

### Optional Probe Files

| File | Content | When |
|---|---|---|
| `puppeteer-probe.json` | JS/CSS coverage metadata, CDP diagnostics | When Puppeteer selected |
| `selenium-probe.json` | Compatibility probe results | When Selenium selected |

## Output Format Summary

| # | Output | Format | Generated When |
|---|---|---|---|
| 1 | report-full | Markdown | Always |
| 2 | report-ok | Markdown | Always |
| 3 | report-errors | Markdown | Always |
| 4 | report-easyread | Markdown | Always |
| 5 | report-easyread-good | Markdown | Always |
| 6 | report-easyread-errors | Markdown | Always |
| 7 | report-full.pdf | PDF | Always |
| 8 | screenshots/ | PNG | Always |
| 9 | lighthouse/ | JSON | Always |
| 10 | sitespeed/ | HTML+JSON+PNG | Full mode only |
| 11 | crawlee-storage/ | JSON | When Crawlee selected |
| 12 | puppeteer-probe | JSON | When Puppeteer selected |
| 13 | selenium-probe | JSON | When Selenium selected |

**Minimum per run:** 7 markdown/PDF reports + screenshots + Lighthouse JSON = **9 output types**.
**Maximum per run (full mode, all tools selected):** **13 output types**.
