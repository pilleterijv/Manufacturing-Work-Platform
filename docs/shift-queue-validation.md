# Shift queue and asset workflow verification

Verified November 17, 2026 using production Next.js runtime, Chromium and synthetic accounts in randomly named disposable PostgreSQL databases. No company credentials or live integration endpoints were used. Persistent app data and uploaded files were not migrated or replaced during verification.

## Checks

- Production build and generated portable runtime; TypeScript checks.
- 78 unit tests, including overnight/DST shift windows, personal/shared assignment rules, immutable expected revisions, mid-shift activation, equipment scope and presentation-only home profiles.
- Fresh migration and upgrade checks through migration 017, preserving existing account grants and history.
- New role/browser suite: current, completed and missed shift checks; older revision not satisfying the current requirement; own/department permissions; maintenance priority and due-today labels; machine labels including line and ID; scoped machine workspace; actual recording machine unchanged by header reminders; compact navigation; manager validation queue; tablet layout.
- Maintenance pagination: 105 equal-date plans, stable ordering and continuation after deleting the cursor row; a foreign department's legacy cursor is rejected.
- Existing core workflow suite: login, required photos, standard runs, timers, audits, immutable revisions, training, Excel export, four roles, permission revocation, CSRF, account provisioning and mobile layout.
- Existing custom role, personal dashboard/delegation and floor usability suites.
- Centerlines, tablet/dashboard, problem-solving, location/task assignment, PM/data/reminder, 5S/CIL/defect and security/browser suites.
- Contextual search and connected-service tests, using local email streams and fake external transport.

The new screenshots are in [screenshots/shift-queues-assets](screenshots/shift-queues-assets). They use synthetic fixtures.

## Pilot limits

Browser emulation does not replace testing on actual company tablets, cameras, Wi-Fi and shift configurations. Refresh reloads server state; the queue is not a live TrakSYS connection. Real SMTP, SQL, TrakSYS and MaintainX setup still needs IT validation. Entra SSO remains unimplemented. Database migration 017 must be applied through the supported migration runner before the updated app starts.
