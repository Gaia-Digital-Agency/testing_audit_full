export function getAvailableTools() {
  return [
    {
      name: "playwright",
      role: "Primary browser automation backbone for functional, smoke, viewport, and cross-browser checks."
    },
    {
      name: "lighthouse",
      role: "Quality budgets and performance analysis on key public routes."
    },
    {
      name: "crawlee",
      role: "Recursive route discovery, sitemap ingestion, and breadth-first coverage."
    },
    {
      name: "axe-core",
      role: "Accessibility assertions inside rendered page journeys."
    },
    {
      name: "sitespeed.io",
      role: "Repeatable performance profiling and regression-oriented speed analysis."
    },
    {
      name: "selenium",
      role: "Compatibility fallback for edge browser-grid or legacy scenarios."
    },
    {
      name: "puppeteer",
      role: "Chrome-specific instrumentation when lower-level browser control is needed."
    }
  ];
}
