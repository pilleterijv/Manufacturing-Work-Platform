# Floor usability review and custom roles

Update: the role-focused home panels, expandable secondary tools/reports,
machine/shift context, machine-label entry, draft warnings, filtered assignment
shortcuts and report retry protection are now implemented. See
[the current floor workflow guide](floor-workflows.md) for behavior and limits.
The recommendations below remain the original review; formal document approval,
device-specific pilot validation and per-location role differences remain future work.

The app covers the main manufacturing workflows, but it still presents many tools
at the same level. The next usability priority is reducing decisions during a
shift. This is a code/workflow review, not a claim that operators have completed
an on-floor usability trial. A pilot with real tablets, gloves and shift handoffs
should decide which changes matter most.

## Recommended role experience

| Role | First screen | Keep secondary |
| --- | --- | --- |
| Operator | My shift: assigned work, PM/CIL/5S checks, record downtime, report a defect, find a guide | History, ideas and studies |
| DL/TL | Shift board: DL/TL Standard Work, missed checks, abnormal conditions, handoff, assigned actions | Detailed audit history and reporting |
| Manager | Department exceptions: overdue actions, approvals, missed checks, defects and department performance | Plan editing, team account administration |
| Admin | Setup and service health: location catalog, roles, accounts, integrations, audit history | Operational entry forms |

These are recommended navigation changes, not a redesigned navigation release.
Existing personal dashboard settings can already choose a permitted landing tab
and dashboard panels. Hide functions a role does not need rather than teaching
everyone every tab.

## Highest-priority mistake prevention

1. Keep the active plant, department, area, machine and shift visible during entry.
   Add a QR/barcode entry path to open the correct machine and confirm identity.
   Existing controlled location/machine choices should remain the source of truth.
2. Make summary cards open the exact filtered list promised by their label. An
   “open ideas” card should carry the open-status filter, not just open the tab.
3. Add consistent unsaved-change prompts and visible saving/saved/failed status.
   Explain what happens next after submission and who owns the next action.
   Do not imply work is saved offline before a server confirms it.
4. Extend duplicate-submission protection consistently. Suggest existing open
   defects/problems for the same machine before creating another investigation.
5. Separate doing work, reviewing history and maintaining plans. Prefer large
   touch controls, short required forms, relevant defaults and conditional fields.
   Test with gloves, camera permissions, weak Wi-Fi and shared tablets.
6. For critical instructions, add a formal approval/effective-date and training
   acknowledgment workflow. Revision/history preservation exists; it is not the
   same as an approved-document release process.
7. Pilot a complete shift with each role. Track wrong-machine entries, duplicate
   records, abandoned forms, time to find work and missed handoffs. Use those
   observations to adjust defaults and required fields.

No interface can make human mistakes impossible. Prevent predictable mistakes,
make unusual entries visible before submission, and preserve traceable corrections.

## Custom roles delivered in this update

Admin opens **Permissions → Create custom role**, enters a clear role name and
purpose, chooses an Operator, DL/TL or Manager workflow, then selects functions
and specific management privileges. Save the role. In **Accounts**, assign it to
the person, then assign the permitted departments, areas or machines using the
existing workspace access controls. Check any additional permissions on the
individual account because they remain additive.

- Roles define **what**; account workspace assignments define **where**.
- A custom Manager workflow does not inherit the built-in Manager's account
  management privileges. Select those explicitly if required.
- The original Admin role remains protected. Only Admin creates/changes roles
  or delegates management privileges. Scoped account managers can assign eligible
  non-Manager roles only within their own location and permission boundaries.
- Existing built-in roles keep their grants. Existing Manager account rights are
  preserved. Use a custom Manager role to select those rights individually.
- Permission changes apply on subsequent requests. Role reassignment signs the
  affected account out. Concurrent role edits require refresh rather than
  overwriting someone else's update.
- Assigned roles cannot be retired, including roles on disabled accounts.
  Reassign those accounts first. Retirement preserves role change history.
- Role name and workflow type are fixed after creation; create a new role to
  change them. Role changes are audited; the interface shows the latest 100.

One account currently has **one role across all its assigned locations**, plus
individual additional permissions. The same person cannot yet have Manager
permissions in one department and Operator permissions in another through separate
role assignments. That would require a further per-location role-assignment model.

## Upgrade and verification

Back up the database and uploaded evidence. Preserve private `.env` settings.
After updating source and stopping the old app, run:

```sh
npm ci
npm run db:generate
npm run db:setup
npm run build
npm start
```

Migration **015** adds custom role metadata, assignments and role change history.
It preserves existing accounts, permissions, location assignments and work records.
Run setup before starting the new runtime; the new code expects these columns.

Developer verification uses `node tests/isolated-roles.cjs` after the build. It
creates a random disposable database on local PostgreSQL, applies setup only to
that database, starts a separate production server and tests role boundaries and
existing workflows. It requires local CREATE DATABASE permission and Chromium.
The configured application database is not migrated by this test runner.
