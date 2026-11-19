# Dashboard charts, named accounts and assignment email

## What users see

Section dashboards have a Chart view selector for bar, donut or data table. The personal/department dashboard charts the selected assignment panels. Charts use the same permission-scoped data as the dashboard and retain the original count/sampling explanation. A zero-result chart shows an empty state instead of inventing percentages. These are categorical counts, not an invented trend or a claim that all categories measure overdue work.

Account requests, Admin account creation and delegated department-account forms collect first name, last name and work email. The database retains structured names and a combined display name. Existing account IDs and task ownership are preserved. Existing full-name API clients remain compatible; legacy accounts may still need an Admin to correct name parts and add a missing email. Initial bootstrap administrator setup remains compatible with its existing full-name flow.

Task pickers already use the saved account ID rather than a typed display name. Name/username search narrows permitted directory entries. People with duplicate names can be distinguished by username. Inactive accounts cannot be picked. This does not import the company employee directory automatically or expose everyone’s email in task search responses.

## Assignment notifications

New/reassigned problem-solving facilitators/reviewers and action owners, PM/CIL assignees, explicitly assigned standard work, named shift-requirement assignees, idea pilot/validator responsibilities and defect reassignment create durable email jobs and in-app notifications. Unassigned station work has no invented personal recipient. An ordinary save with unchanged assignees does not send another assignment email; overdue reminders and missed-shift alerts continue through their existing channels.

The database transaction saves the assignment and its notification queue together. The worker resolves the current account email at send time and verifies that the account is active, still assigned, has the relevant module capability and is permitted for the equipment. Completed/retired/closed work and revoked/reassigned accounts cancel obsolete pending jobs. Notifications use stable task/account IDs; editing a person’s display name does not redirect their assignments.

Missing emails or SMTP failures remain pending with bounded backoff, then become Failed after ten attempts. Admin can inspect pending/failed/sent counts and retry failed assignment mail in Integrations after correcting the account or service. Sent means accepted by the SMTP service, not proof it reached the inbox. SMTP delivery is at-least-once; a process failure between acceptance and saving the delivery result can cause a duplicate. Stable Message-ID values help tracing but do not guarantee recipient-side deduplication.

## Required deployment steps

1. Back up the app database and media. Pull the correct current branch and install its lockfile dependencies using the normal deployment process.
2. Run `npm run db:generate` and the supported `npm run db:setup` against the approved app PostgreSQL target. New migration **020** adds name parts and the assignment-delivery table. It backfills existing names conservatively; it does not fabricate email addresses or change account IDs/permissions. Do not replace the PostgreSQL URL with the company SQL Server connection.
3. Build and restart the web service and background worker. In external-worker mode, restart the separately supervised worker as well. Do not run the new code against an unmigrated database.
4. In Accounts, review existing first/last names, work email, active status and department/area/equipment assignments. A migrated single-word display name has no invented surname.
5. Have IT configure `SMTP_HOST`, `SMTP_FROM` and the approved `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` / `SMTP_PASSWORD` settings privately as required by the mail service. A website that loads is not proof that email is configured.
6. Use one approved test account to verify assignment, reassignment, actual inbox delivery and the in-app notification. Then pilot with a small group. Browser regression tests use a synthetic transport and never send company email.

## Validation

Meaningful checks cover account/request names, compound names, legacy compatibility, directory search, same-ID identity, assignment creation/reassignment, current-email lookup, recipient disablement/revocation, duplicate/retry behavior, missing-email recovery, charts and tablet layout. Migration checks use randomly named temporary databases and preserve existing accounts/records on upgrade. The existing floor workflow and security suites are also run before publishing. No persistent plant database is migrated by these tests.

## Source readability

Project formatting is defined in `.prettierrc.json`: 110-character lines, two-space indentation and trailing commas only where ES5 permits them. Short calls stay on one line; blocks and longer expressions retain clear scope/indentation. The pass covers TypeScript/React, Node scripts and browser/unit tests, not generated dependencies or already-applied SQL migrations. The timer interval now fits on one line without changing timing/cleanup behavior. Source line count across the 233 source/test files dropped from about 49,165 to 42,258; this is readability/formatting, not removal of application logic or a runtime performance optimization.

Verified before publishing: TypeScript, 86 unit tests, production build, fresh/001/003 migration upgrades, core login/submission/export browser workflows, custom-role boundaries, floor-role/tablet usability, security/media checks and scoped submission history. For the formatting-only checkpoint, a comparison of the emitted production-code syntax trees across 178 files (normalizing parentheses and equivalent adjacent JSX text chunks) found no semantic structure differences from the pre-format checkpoint. The mail regression uses `.invalid` fixture addresses and a fake transport; live SMTP/inbox delivery still requires company configuration and a pilot test.
