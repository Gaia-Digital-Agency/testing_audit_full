# Test Strategy

## Objective

A reusable quality testing platform that validates websites and web apps from a separate tester repo. Supports fast smoke testing and deeper full-run auditing across desktop and mobile browsers, prompts for runtime target details in the CLI, and writes Markdown and PDF reports into a dedicated run folder under `/output`.

## Operating Model

### Tester Repo

The developer operates from this repo only. The tester is not embedded into client projects.

### Runtime Inputs

The CLI asks **5 questions** at runtime:

1. Project name
2. Public URL
3. SSH command (e.g. `ssh azlan@gda-s01`) — user and host are parsed automatically
4. Project path on the server
5. Mode (`smoke` or `full`)

Optional credentials and seed data for authenticated flows may be added in later phases.

### Output Model

Each run writes artifacts into `/output/{timestamp}-{project}-{mode}/`:

- 6 Markdown reports (technical + plain-language versions)
- 1 PDF report
- Screenshots per browser × route
- Lighthouse JSON reports
- sitespeed.io artifacts (full mode only)
- Optional Puppeteer / Selenium probes

See [`architecture.md`](architecture.md) for the complete output file list.

## Test Modes

### `smoke`

Purpose: fast confidence gate after deploy or before release.

Scope:
- Health check of base URL and key routes
- Critical navigation
- Primary CTAs and buttons
- Critical forms and validation
- Login/session bootstrap if applicable
- Top-level console and network error detection
- Broken hero images and major asset failures
- Mobile and desktop viewport sanity checks

Success criteria:
- No blocking route failures
- No critical JS/runtime failures
- No broken core flow
- Report produced in `/output`

Target runtime: **3-7 minutes**

### `full`

Purpose: broad quality sweep across the target application or website.

Scope:
- Recursive crawl of pages, subpages, and internal links
- Template coverage and route classification
- Button and form interaction coverage
- Broken link and broken asset detection
- Console, request, and response error capture
- Viewport and responsive layout checks
- Accessibility checks with `axe-core`
- Lighthouse budgets for key templates or journeys
- Visual regression snapshots for critical pages and states
- Optional authenticated journeys and role-based checks

Success criteria:
- No critical blockers without clear classification
- All target areas covered or explicitly marked skipped
- Complete report and artifacts written to `/output`

Target runtime: **15-35 minutes**

## Coverage Areas

The platform classifies checks into these domains:

- Availability
- Navigation
- Links
- Buttons
- Forms
- Authentication
- Content rendering
- Assets and media
- Responsive layout
- Accessibility
- Performance
- SEO and best-practices where relevant
- Visual regression
- Console and runtime errors
- Network and API failures

## Browser Matrix

Primary execution uses Playwright projects:

- desktop Chromium
- desktop Firefox
- desktop WebKit
- mobile Chromium
- mobile WebKit

Smoke mode uses desktop-chromium and mobile-webkit. Full mode uses all 5.

## Tool Roles

### Core
- **Playwright**: orchestration, interaction, assertions, screenshots, traces, videos, browser matrix

### Discovery
- **Crawlee**: route discovery, sitemap ingestion, internal link traversal, queue management

### Accessibility
- **axe-core**: accessibility assertions embedded into page runs
- **Pa11y**: optional secondary accessibility runner (future)

### Performance
- **Lighthouse** / **LHCI**: page quality scoring and budgets
- **sitespeed.io**: repeatable performance profiling and regression comparison

### Visual
- Playwright snapshots first
- **Percy** or **Applitools**: later, if managed review workflows are needed

### Optional Support
- **Puppeteer**: Chrome-only instrumentation when CDP depth is needed
- **Selenium**: only if a remote grid or legacy browser path becomes necessary
- **MSW**: mock APIs in controlled test environments

## Architecture Layers

### 1. Runtime Input Layer
Collects the 5 CLI inputs and materializes an in-memory run config.

### 2. Discovery Layer
Discovers sitemap URLs, internal pages, forms, buttons and CTA candidates, assets and media references.

### 3. Detection Layer
Profiles the target and infers likely stack traits:
- Website vs application
- SSR vs SPA tendencies
- WordPress / Next.js / Payload CMS / React indicators
- API-heavy backend tendencies
- Authenticated flow requirements

The profiler chooses tools as capabilities inside one pipeline, not as isolated report sections.

### 4. Orchestration Layer
Chooses the combined audit process based on the profile:
- Playwright as the default execution backbone
- Crawlee for crawl breadth and route inventory
- axe-core for accessibility passes within rendered page flows
- Lighthouse for key-route quality budgets
- sitespeed.io for broader performance profiling where useful
- Puppeteer for Chrome-specific instrumentation when needed
- Selenium only as a compatibility fallback

The user-facing report describes the end-to-end audit process and combined findings, not per-tool result silos.

### 5. Execution Layer
Runs the smoke or full suite against critical paths / discovered targets, across all selected browsers and viewports.

### 6. Audit Layer
Collects console errors, failed requests, layout overflow indicators, accessibility results, Lighthouse metrics, visual diffs.

### 7. Reporting Layer
Produces Markdown reports for humans, PDF for distribution, JSON for automation, screenshots and trace links for debugging.

## Report Requirements

Every report contains:

- Run timestamp
- Mode (`smoke` or `full`)
- Target project name
- Target URL
- SSH target summary
- Auth input summary
- Browser and device coverage
- Summary counts by severity
- Failed routes and reasons
- Broken links and broken assets
- Form and auth results
- Accessibility findings summary
- Performance summary
- Visual regression summary
- Artifact paths
- Skipped checks and blockers
- Detected target profile
- Selected tool stack
- Combined audit process

## Severity Model

| Level | Meaning |
|---|---|
| `critical` | Release-blocking or route-blocking failure |
| `high` | Major functional regression or major accessibility/performance issue |
| `medium` | Important but non-blocking issue |
| `low` | Minor defect or improvement item |
| `info` | Observation and telemetry |

## Delivery Phases

### Phase 1 ✅
- Repo scaffold
- CLI prompt flow
- Playwright projects
- Smoke runner skeleton
- Markdown and PDF report generators

### Phase 2 ✅
- Crawlee route discovery
- Core smoke journeys
- Console/network/asset checks
- Output artifact wiring

### Phase 3 ✅
- Full crawl mode
- Accessibility integration
- Lighthouse integration
- Responsive layout checks

### Phase 4 (In progress)
- Visual regression
- sitespeed.io integration ✅
- Adapter presets for Next.js, WordPress, Payload CMS, Express/NestJS apps
- Plain-language (easyread) reports ✅

## Assumptions

- Most target apps are reachable by a public URL.
- SSH is provided for setup, diagnostics, or private environment access — not as the primary rendering channel.
- Some projects will need per-project credentials and route allowlists.
- The first implementation optimizes for reliability and readable reports before advanced AI-style heuristics.
