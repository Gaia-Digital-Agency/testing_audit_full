# Test Strategy

## Objective

Build a reusable quality testing platform that can validate websites and web apps from a separate tester repo. The platform must support fast smoke testing and deeper full-run auditing across desktop and mobile browser targets, prompt for runtime target details in the CLI, then write complete Markdown and PDF reports into a dedicated run folder under `/output`.

## Operating Model

### Tester Repo

The developer operates from this repo only. The tester is not embedded into client projects.

### Access Model

The developer provides the required target details at runtime through the CLI:

- project name
- public external URL
- SSH host
- SSH user
- project path on the server
- optional auth username
- optional auth password
- optional credentials or seed data later for authenticated smoke and full flows

### Output Model

Each run writes artifacts into `/output`:

- one dedicated run folder per query
- one Markdown summary report
- one PDF report
- screenshots
- traces
- videos if enabled
- machine-readable JSON summaries for future aggregation

## Test Modes

## `smoke`

Purpose: fast confidence gate after deploy or before release.

Scope:

- health check of base URL and key routes
- critical navigation
- primary CTAs and buttons
- critical forms and validation
- login/session bootstrap if applicable
- top-level console and network error detection
- broken hero images and major asset failures
- mobile and desktop viewport sanity checks

Success criteria:

- no blocking route failures
- no critical JS/runtime failures
- no broken core flow
- report produced in `/output`

Target runtime:

- ideally 3 to 10 minutes depending on auth complexity and environment stability

## `full`

Purpose: broad quality sweep across the target application or website.

Scope:

- recursive crawl of pages, subpages, and internal links
- template coverage and route classification
- button and form interaction coverage
- broken link and broken asset detection
- console, request, and response error capture
- viewport and responsive layout checks
- accessibility checks with `axe-core`
- Lighthouse budgets for key templates or journeys
- visual regression snapshots for critical pages and states
- optional authenticated journeys and role-based checks

Success criteria:

- no critical blockers without clear classification
- all target areas covered or explicitly marked skipped
- complete report and artifacts written to `/output`

## Coverage Areas

The platform should classify checks into these domains:

- availability
- navigation
- links
- buttons
- forms
- authentication
- content rendering
- assets and media
- responsive layout
- accessibility
- performance
- SEO and best-practices where relevant
- visual regression
- console and runtime errors
- network and API failures

## Browser Matrix

Primary execution should use Playwright projects:

- desktop Chromium
- desktop Firefox
- desktop WebKit
- mobile Chromium
- mobile WebKit

Firefox mobile emulation is less valuable than the combinations above, so it should be optional rather than required.

## Tool Roles

### Core

- `Playwright`: orchestration, interaction, assertions, screenshots, traces, videos, browser matrix

### Discovery

- `Crawlee`: route discovery, sitemap ingestion, internal link traversal, queue management

### Accessibility

- `axe-core`: accessibility assertions embedded into page runs
- `Pa11y`: optional secondary accessibility runner later

### Performance

- `Lighthouse` / `LHCI`: page quality scoring and budgets
- `sitespeed.io`: repeatable performance profiling and regression comparison

### Visual

- Playwright snapshots first
- `Percy` or `Applitools` later if managed review workflows are needed

### Optional Support

- `Puppeteer`: Chrome-only instrumentation when CDP depth is needed
- `Selenium`: only if a remote grid or legacy browser path becomes necessary
- `MSW`: mock APIs in controlled test environments

## Architecture

### 1. Runtime Input Layer

Prompts for:

- project name
- external URL
- SSH host
- SSH user
- project path
- optional auth credentials
- mode

Then materializes an in-memory run config for the selected execution path.

### 2. Discovery Layer

Discovers:

- sitemap URLs
- internal pages
- forms
- buttons and CTA candidates
- assets and media references

### 3. Detection Layer

Profiles the target and infers likely stack traits such as:

- website vs application
- SSR vs SPA tendencies
- WordPress indicators
- Next.js indicators
- Payload CMS indicators
- React indicators
- API-heavy backend tendencies
- authenticated flow requirements

The profiler should choose tools as capabilities inside one pipeline, not as isolated report sections.

### 4. Orchestration Layer

Chooses the combined audit process based on the profile:

- `Playwright` as the default execution backbone
- `Crawlee` for crawl breadth and route inventory
- `axe-core` for accessibility passes within rendered page flows
- `Lighthouse` for key-route quality budgets
- `sitespeed.io` for broader performance profiling where useful
- `Puppeteer` for Chrome-specific instrumentation when needed
- `Selenium` only as a compatibility fallback

The user-facing report should describe the end-to-end audit process and combined findings, not break the run into per-tool result silos.

### 5. Execution Layer

Runs:

- smoke suite against critical paths
- full suite against discovered targets
- cross-browser and cross-viewport projects

### 6. Audit Layer

Collects:

- console errors
- failed requests
- layout overflow indicators
- accessibility results
- Lighthouse metrics
- visual diffs

### 7. Reporting Layer

Produces:

- Markdown report for humans
- JSON report for automation
- screenshots and trace links for debugging

## Report Requirements

Every report should contain:

- run timestamp
- mode (`smoke` or `full`)
- target project name
- target URL
- SSH target summary
- auth input summary
- browser and device coverage
- summary counts by severity
- failed routes and reasons
- broken links and broken assets
- form and auth results
- accessibility findings summary
- performance summary
- visual regression summary
- artifact paths
- skipped checks and blockers
- detected target profile
- selected tool stack
- combined audit process

## Severity Model

- `critical`: release-blocking or route-blocking failure
- `high`: major functional regression or major accessibility/performance issue
- `medium`: important but non-blocking issue
- `low`: minor defect or improvement item
- `info`: observation and telemetry

## Delivery Phases

### Phase 1

- repo scaffold
- CLI prompt flow
- Playwright projects
- smoke runner skeleton
- Markdown and PDF report generators

### Phase 2

- Crawlee route discovery
- core smoke journeys
- console/network/asset checks
- output artifact wiring

### Phase 3

- full crawl mode
- accessibility integration
- Lighthouse integration
- responsive layout checks

### Phase 4

- visual regression
- sitespeed.io integration
- adapter presets for Next.js, WordPress, Payload CMS, Express/NestJS apps

## Assumptions

- Most target apps are reachable by a public URL.
- SSH is provided for setup, diagnostics, or private environment access, not as the primary rendering channel.
- Some projects will need per-project credentials and route allowlists.
- The first implementation should optimize for reliability and readable reports before advanced AI-style heuristics.
