# Suggested searches and section dashboards

Captured with temporary demonstration accounts and records, removed after each test. Desktop: 1440 × 1000. Tablet: 820 × 1180 browser viewport; not a physical-device installation test. Browser timezone: America/Chicago.

- `search-suggestions.png`: equipment/department/area/line/task suggestions and the detail/history view.
- `time-studies-dashboard.png`: expanded sidebar views, matching filters, full study total, loaded-observation count and cycle mean, status chart and record list.
- `tablet-five-s-dashboard.png`: area-audit overview at tablet width.

Validation: production build and TypeScript passed; 52 unit tests passed; the new search/dashboard workflow and all ten existing browser/API workflow suites passed. The new workflow checks 14 operational dashboards, scope isolation, keyboard selection, equipment/area matching, new history records and an incoming defect after refresh, and preservation of unsaved forms. An isolated portable-runtime test checks account tools, worker environment loading and private-file exclusion. The local legacy-Codespaces startup path was exercised against PostgreSQL with Docker: the named volume and user/equipment/record/migration IDs remained unchanged. An unreachable-database check fails before starting app/worker and does not expose credentials.

Run `node tests/section-search-dashboard.cjs` against the local test server to regenerate these screenshots. The affected user's Codespace and Docker daemon are separate from this verification environment; live recovery there still needs confirmation. See [usage and recovery](../../section-search-dashboards.md).
