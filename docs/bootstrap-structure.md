# Bootstrap Structure

## Proposed Repo Layout

```text
quality_tester/
├── README.md
├── bin/
│   └── qatester.mjs
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── docs/
│   ├── test-strategy.md
│   └── bootstrap-structure.md
├── output/
│   └── .gitkeep
├── src/
│   ├── cli.ts
│   ├── types.ts
│   ├── profiling/
│   │   └── README.md
│   ├── orchestration/
│   │   └── README.md
│   ├── discovery/
│   │   └── README.md
│   ├── smoke/
│   │   └── README.md
│   ├── full/
│   │   └── README.md
│   ├── audits/
│   │   └── README.md
│   └── reporting/
│       └── markdown.ts
└── tests/
    ├── smoke/
    │   └── critical-path.spec.ts
    └── full/
        └── crawl-health.spec.ts
```

## Directory Responsibilities

### `bin/`

Holds the interactive CLI entrypoint that collects runtime inputs and launches the selected mode.

### `output/`

Receives a dedicated folder per run containing:

- `report.md`
- `report.pdf`
- supporting artifacts from that run

### `src/discovery/`

Will hold sitemap ingestion, crawl queueing, and route inventory logic.

### `src/profiling/`

Will hold target detection and stack inference logic.

### `src/orchestration/`

Will hold tool selection and combined execution-plan assembly.

### `src/smoke/`

Will hold critical-path definitions and smoke-specific helpers.

### `src/full/`

Will hold recursive crawl orchestration and extended audit flows.

### `src/audits/`

Will hold reusable checks such as:

- console errors
- network failures
- image load verification
- layout overflow
- accessibility
- Lighthouse integration

### `src/reporting/`

Will build the Markdown report and future JSON summaries.

### `tests/smoke/`

Playwright specs for critical-path validation.

### `tests/full/`

Playwright specs for wide crawl and audit coverage.

## Initial Build Order

1. Implement interactive CLI prompts.
2. Implement in-memory run configuration.
3. Implement smoke route checks for a prompted target.
4. Implement Markdown report output into `/output`.
5. Add discovery and full-run breadth.
