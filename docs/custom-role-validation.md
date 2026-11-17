# Custom role verification — 2026-11-13

Verified the production build with migration 015 in disposable local PostgreSQL
databases. The configured persistent application database was not migrated.
No live company SQL, TrakSYS, MaintainX or email connection was used.

Passed:

- Production build and TypeScript checking.
- All 71 unit tests, including custom policy selection, fail-closed policy
  validation, explicit custom Manager privileges and individual additions.
- Fresh migration and upgrades from 001/003, preserving existing users, grants,
  assignments and raw historical records.
- Custom role browser/API workflow: Admin-only role changes, duplicate names,
  protected Admin, invalid global grants, concurrent version protection,
  unchanged location assignments, scoped machine lists, scoped PM editing,
  forbidden cross-department writes, immediate privilege revocation, explicit
  individual additions, custom Manager without implicit account rights,
  retirement restrictions, audit snapshots and real role-editor interaction.
- Existing browser workflow: login, photos, runs, timers, audits, immutable
  revisions, training, exports, four base roles, revocation, CSRF, upload limits,
  provisioning, forced password change, sessions, CSP and mobile layout.
- Personal access, account delegation, dashboard preferences and assistant suite.
- Security/tablet readiness suite.
- Location and leader-task workflows.
- PM/CIL, evidence, external-data validation and overdue reminders suite.
- 5S, CIL, defects, personal dashboards and account recovery suite.
- Centerline definitions, audits, evidence, revisions, deduplication and exports.
- Contextual search and cross-tab filter isolation suite.
- Tablet/PWA, offline privacy, paginated department dashboards and role separation.

The API tests use real sessions and separate temporary accounts. Browser checks
use Chromium with synthetic data. The new role screen is captured in
`docs/screenshots/custom-roles/permissions.png`.

Reproduce after `npm run build` with:

```sh
node tests/isolated-roles.cjs
node tests/isolated-roles.cjs tests/custom-roles-browser.cjs tests/location-workflows.cjs tests/maintenance-data-reminders.cjs tests/floor-expansion-browser.cjs tests/centerlines-browser.cjs tests/contextual-search-browser.cjs tests/tablet-dashboard.cjs
```

These checks do not replace a pilot with real floor users, shared devices, gloves,
site network conditions and actual shift handoffs. The navigation recommendations
in the usability review are proposals, not implemented screen redesigns.
