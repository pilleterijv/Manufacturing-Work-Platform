# Floor workflow verification — 2026-11-13

Passed on the production build with disposable local PostgreSQL databases:

- Production build and TypeScript checks; all 72 unit tests.
- Fresh installation and upgrades from 001/003 through migration 016, preserving
  accounts, custom grants, location assignments, media references and raw history.
- Core login, standard work, time studies/timers, audits, immutable revisions,
  training, exports, four roles, revocation, provisioning, password change, upload
  limits, CSRF/CSP and mobile layout.
- Role home panels, machine context and rejected unassigned labels; scoped
  existing-issue suggestions and selected/open/personal/department filters.
- Concurrent keyed defect/problem submissions return the original ID/reference;
  changed payloads with the same key are rejected.
- Failed save retains entries; successful save with failed refresh stays saved.
- Cancelled navigation and cancelled investigation-filter changes preserve typed
  values. Controlled text inputs retain values while the draft observer runs.
- Contextual suggestions, recorder/person filters and cross-tab isolation.
- Personal dashboard preferences, scoped account management, custom roles,
  protected Admin, individual delegation and immediate permission revocation.
- Centerline definitions/audits/revisions, stale writes, required evidence,
  deduplication, exports and refresh-preserved drafts.
- Tablet PWA/service worker, offline privacy, dashboard pagination and role scope.
- Problem persistence, assignments, stale writes, closure, escalation and queues.
- Department/area catalogs, assigned leader work, configurable actions and media.
- PM/CIL recurrence and immutable history, Excel/feed validation and overdue alerts.
- 5S, defects, fake MaintainX transport, registration, recovery and disabled users.
- Protected API/media reads, range limits, output encoding and safe errors.

Fixtures were synthetic and removed. The runner creates and drops randomly named
local test databases; it does not migrate the configured persistent application
database. No live company SQL, TrakSYS, MaintainX or SMTP connection was tested.

Reproduce after `npm run build`:

```sh
npm test
npm run test:migrations
node tests/isolated-roles.cjs tests/browser.cjs tests/floor-usability-browser.cjs tests/personal-access-assistant.cjs tests/custom-roles-browser.cjs
node tests/isolated-roles.cjs tests/contextual-search-browser.cjs tests/centerlines-browser.cjs tests/tablet-dashboard.cjs tests/problems-browser.cjs tests/location-workflows.cjs tests/maintenance-data-reminders.cjs tests/floor-expansion-browser.cjs tests/security-readiness.cjs
```

Only one runner should use a port at a time. Developers can set
`FLOORWORK_TEST_PORT=3108` to run an independent disposable database/server on a
second port. Tests require local PostgreSQL CREATE DATABASE permission and Chromium.

Screenshots are in [floor-usability](screenshots/floor-usability): Operator,
DL/TL, Manager and Admin home screens, plus tablet context and defect entry.
Actual iPad/Safari camera operation, gloves, Wi-Fi interruptions and shift handoff
still require a workplace pilot. See [behavior and update steps](floor-workflows.md).
