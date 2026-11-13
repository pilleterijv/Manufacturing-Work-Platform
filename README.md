# Floorwork — Manufacturing Work Platform

Search now follows each tab’s actual records and person roles, with isolated filters and native suggestions. See [contextual search behavior and update steps](docs/contextual-search.md).

Current hardening and device readiness: [security/resource review](docs/security-performance-review.md), [iPad/tablet/computer installation](docs/tablet-deployment.md), and [step-by-step TrakSYS/Azure SQL connections](docs/traksys-sql-connection-guide.md). Clients use the shared HTTPS app without Node or Docker. This release updates the vulnerable XML parser, streams video ranges, uploads video without base64 copies, bounds external responses and reuses limited SQL pools.

Machine **Centerlines** now support product/setup settings, numeric or text limits, photo/video audit evidence, permanent revision snapshots and follow-up results. **Apply migration 014 before starting this update.** See [Centerlines setup and usage](docs/centerlines.md).

A browser application for standard work, photographic evidence, time studies, DL/TL Standard Work, troubleshooting, training, role permissions, downtime tracking, improvement ideas, leadership reporting, and Excel exports. PostgreSQL is the primary database; Excel is an export format.

This update adds area-based **5S audits**, machine **TPM/CIL**, **defect reporting with optional MaintainX work-order submission**, personal/assigned-department dashboards, registration approval, password-recovery emails and searchable account pickers. See [setup and limits](docs/five-s-tpm-access.md) and [screenshots](docs/screenshots/five-s-tpm). Migration 011 preserves existing work. Live MaintainX/SMTP require private IT setup; no company work orders or emails have been sent by development tests.

## Reference forms, leader work and obsolete content

The supplied department/area catalog, 2D/4D/8D form fields and optional second 5-Why path are available. DL/TL leader shift checklists are separate from timed process audits, dashboard cards open their sections, and obsolete standards/tasks/guides can be retired without deleting completed evidence. **Apply migration 013 before starting this version.** See [setup, catalog loading and migration instructions](docs/reference-forms-leader-work.md).

## Search, section dashboards and history refresh

Operational sections now offer expandable **Dashboard / In detail** menus, scoped machine/area/task/person suggestions and history refresh controls. Startup checks PostgreSQL and reports actionable service errors. See [usage and database recovery](docs/section-search-dashboards.md).

## Personal dashboards, account delegation and assistant

Each account can choose its login section and dashboard panels. Managers manage ordinary accounts wholly within their assigned scope; Admin can grant specific additional permissions to individual accounts. Neutral branding replaces the company-specific wordmark. The read-only Assistant provides permitted built-in navigation help plus optional OpenAI answers after private server setup and Admin enablement. See [setup and boundaries](docs/personal-dashboards-access-assistant.md) and [current screenshots](docs/screenshots/personal-access). Migration 012 preserves existing work and role policies.

## Orange / white company styling

The interface uses an orange/white theme with neutral Manufacturing Work Platform branding. Named company branding has been removed. See [brand asset handover](docs/company-branding.md).

## Company hosting, Windows and ownership

Command Prompt can launch the app but does not replace Node.js. For employees to use it without installing Node or Docker, host it once on a company server and distribute its HTTPS/PWA shortcut. Docker is optional; the server still needs a Node runtime and PostgreSQL (native or managed). A signed Windows installer with a bundled runtime is a separate packaging task. Follow the [step-by-step company rollout guide](docs/company-rollout-step-by-step.md) for ownership, private repositories, staging, Windows/server deployment, TrakSYS/SQL/Excel/MaintainX connections, identity, backups and pilot acceptance.

## PMs, people filters, overdue reminders and connected data

See [feature setup and validation](docs/maintenance-data-validation.md) and the [company ownership/server integration handover](docs/company-ownership-deployment.md). This update adds machine PMs, scoped people/text filters, overdue in-app/email reminders, device video evidence and Excel production-results imports, with read-only SQL Server/PostgreSQL feeds for operational sections. Migration 010 is additive. Email, company databases and TrakSYS still require private IT configuration and live validation.

## Department assignments and visual guides

See [department/area setup, manager assignments, DL/TL tasks, problem-solving requirements and device media](docs/location-task-management.md). **After upgrading, Admin must assign departments/areas to non-Admin users before they resume work.** Migration 009 preserves restricted downtime assignments as the initial workspace scope; other non-Admin accounts start without assigned locations.

## Install on tablets / shared workplace use

See [tablet installation and secure shared deployment](docs/tablet-deployment.md).
Modern iPad, Android and Windows tablets can install Floorwork from a trusted
HTTPS site; only the shared server needs Node and PostgreSQL. It requires a
server connection to save work. Local desktop startup below is for one computer.
The main Overview now includes department section statistics; users with
leadership access can also see the overall workspace. Improvement cards display
their unique UUID, full equipment location and an optional process description.

## Run in a browser without local installs

Use [GitHub Codespaces setup](docs/codespaces.md). No Docker Desktop, Node or WSL is needed on your computer. Use the **codex/rebuild-floorwork** branch; start the app in the Codespace and open its private HTTPS preview. The same guide includes iPad, Android and desktop installation steps.

## Download and run on Windows

**[Download the application source as one small ZIP](https://github.com/pilleterijv/Manufacturing-Work-Platform/archive/refs/heads/codex/rebuild-floorwork.zip)**. You do not need to open or download the files individually. Screenshots stay available in GitHub's docs/screenshots folder and are excluded from the ZIP.

1. Install **Node.js 24 LTS** from https://nodejs.org/ and start **Docker Desktop**. Docker **AMD64** is for Intel/AMD computers; ARM64 is for ARM computers. An existing native PostgreSQL installation can be used instead of Docker; see below.
2. Right-click the ZIP → **Extract All**. Open the extracted folder and double-click **START-FLOORWORK.cmd**.
3. First setup downloads the locked dependencies, builds once, prepares a smaller production runtime, and removes build-only dependencies and caches from the application folder. Allow temporary space for the build (approximately 1 GB in the Linux verification environment), plus PostgreSQL/Docker and npm's download cache.
4. Enter your own administrator username, display name, and temporary password privately in the console. There is no default app account. Sign in, replace the temporary password, and sign in again.
5. The browser opens **http://localhost:3000 on your computer**. Keep the console open. Subsequent launches reuse the saved build: no npm installation or compilation unless source files, dependencies, Node major version, or machine architecture change.

Press **Ctrl+C** in the application console to stop the app. To reclaim database resources when finished, run **STOP-DATABASE.cmd**; it stops the database container and keeps its data. Docker Desktop's VM and Node installation are separate from the application runtime. The private npm download cache at `%TEMP%\floorwork-npm` is retained to speed updates; you may remove it when no installation is running if you prefer reclaiming that space.

Your data stays in the existing Docker volume and **uploads/**. **Do not delete those, or .env.** The generated **.floorwork/** folder contains the rebuildable runtime and cache stamp. **CREATE-ADMIN.cmd** provides private administrative account creation/recovery after the runtime is prepared. Runtime bundles exclude .env files and photographic evidence; the launcher loads your configuration privately and points storage at the original uploads folder.

The launcher is syntax checked and its production runtime/database/account tools are verified in isolation on Linux. Native Windows execution still needs validation on Windows. It never bypasses Windows security policies or TLS/checksum verification.

### Lower-overhead database option

If PostgreSQL 17 is already installed natively, you can run without Docker Desktop. Prepare an owned local **work_rebuild** database, set DATABASE_URL in your private .env to that database, and add `FLOORWORK_DATABASE_MODE=existing`. The launcher then skips Docker entirely. It accepts only localhost/127.0.0.1 databases. Preserve/restore your existing database when switching hosts; an empty new database does not contain the data from the Docker volume. Do not send database passwords in chat.

### Repair or development mode

Run `node scripts/windows-start.cjs --rebuild` from the application folder to force a fresh installation/build if a cached runtime is damaged. Add `--keep-build-tools` if you intend to develop locally and want to retain node_modules and .next. For ordinary use, START-FLOORWORK.cmd keeps only the smaller runtime after its first successful build.

## Updating an existing Windows installation

Stop the application console first. Download the updated branch and replace the application source while preserving your existing **.env** and **uploads/**. Keep the same Docker volume. Run START-FLOORWORK.cmd again: it installs the locked dependencies and applies the new checksummed migration without deleting existing accounts or work records. Back up your database and uploads before replacing an installation. Do not copy node_modules or .next from another machine.

The new Downtime and Improvement ideas permissions are added to existing valid role policies by migration 002; Leadership is added for Manager. Existing grants are retained. Admin retains all permissions. Review the new grants under Permissions after upgrading. Admin-only downtime reason/shift configuration cannot be delegated through those module grants.

The default shifts are Shift 1 at **06:00**, Shift 2 at **14:00**, and Shift 3 at **22:00**, in **America/Chicago**. Admins should configure the actual site schedule before tracking production downtime. Existing timers retain the schedule with which they began.

## Linux / macOS development

Node 22+ (24 LTS recommended), Docker with Compose, and PostgreSQL 17 are required.

```sh
cp .env.example .env
npm ci
npm run db:generate
docker compose up -d db
# Wait for PostgreSQL readiness before continuing:
docker compose exec db pg_isready -U work -d work_rebuild
npm run db:setup
npm run user:create
npm run build
npm start
```

Use npm run dev for development. APP_ORIGIN must exactly match the origin you browse; custom write APIs reject missing or different Origin headers. Do not reuse the legacy work database with this rebuild. The new database is work_rebuild and the Compose volume is floorwork_rebuild_data. The previous database volume was preserved.

## Workflows

- **Workspace dashboard:** role-aware section cards link to each permitted workflow; overall and department reporting appears alongside current totals and recent activity.
- **Problem solving:** workbook-based 2D, 4D and 8D records, linked escalation, assigned facilitator/reviewer, method-specific evidence, tracked actions/checkpoints, a manager/owner action update portal, closure checks, change history and a dedicated Excel export. See [methodology mapping and reference limits](docs/problem-solving.md). The private Microsoft Forms design pages could not be read; exact form matching is pending accessible references.

- **Standard work:** latest revisions, ordered Yes/No steps, required/optional photos and comments, completion history, timestamped records, and frozen standard snapshots.
- **Time studies:** named work elements, repeated stopwatch observations, raw seconds/timestamps, average, median, minimum, maximum, range, and population standard deviation per element.
- **DL/TL Standard Work:** department/area-specific assigned checklists, Yes/No findings, required/optional photographic evidence, optional operator context and cycle timing, follow-up flags, and immutable revision history.
- **Training:** searchable equipment-associated YouTube/Vimeo links, trusted embed URLs, playback on demand, and archive. Uploaded MP4 hosting and certification tracking are not implemented.
- **Troubleshooting:** searchable plain-text guides with equipment association and archive.
- **Management:** equipment hierarchy, standard authoring and immutable revision history. Existing runs and audits are never rewritten when a standard changes.
- **Downtime:** Admin-managed reasons and timer availability; shared start/stop timer per equipment; server timestamps survive reloads; no overlapping active events for a machine. Configure 1–8 daily shifts and an IANA time zone. Events split across shift boundaries, overnight dates, and daylight-saving changes, using the schedule and reason/equipment snapshots saved when they started.
- **Leadership dashboard:** workspace-wide and department-level summaries of work, studies, audits, downtime, ideas, standards, training, guides, and equipment. Default reporting period is 30 local calendar days, with a maximum 366-day range. Period metrics and current library/pipeline counts are labeled separately. Reporting uses complete queried records, rather than the paged operational histories. Department filters organize reporting; department/area assignments restrict the underlying records and exports. Admin and Manager have leadership access by default; Admin can edit role grants.
- **Improvement ideas:** current state, proposal, equipment/department, due date, submitter, pilot, validator, and participants. Creator identity is always recorded separately. The pilot receives a **private in-app notification**, created in the same transaction as the idea. Notifications refresh every 20 seconds while signed in and can be marked read. Overdue reminders support separately switchable in-app and email delivery after IT configures SMTP. Pilot/validator can update progress; only the validator or Admin can mark completed. Ideas are shared within the workspace among people with the ideas permission.
- **Access:** individual accounts, Admin/Manager/DL-TL/Operator roles, editable role policies checked by the server on every request, forced initial/reset password change, account reset/deactivation, remembered sessions, and session revocation.
- **Analytics/Excel:** completed records, No-answer rates, failures by equipment/step, elapsed completion time, timing statistics, audit follow-ups; up to nine XLSX sheets with raw observations. A scheduled completion percentage is not displayed; Shift requirements separately monitors missed shift completions. Overview displays eight recent records with exact totals; work histories load 100 records per page with a Load more history button. Statistics in the Analytics section reflect loaded history; leadership reports and exports query their complete scope.

## Verification

```sh
npm run typecheck
npm test
npm audit
# Start the production build in a separate terminal, then:
npm run test:browser
npm run test:operations
npm run test:tablet
npm run test:problems
# Optional synthetic-data walkthrough of every section:
npm run screenshots
# Optional local PostgreSQL verification (requires CREATE DATABASE permission):
npm run test:migrations
```

Browser tests require Chromium (CHROMIUM_PATH defaults to /usr/bin/chromium), a local database, and a running production app at APP_URL (default http://localhost:3000). Tests create random temporary accounts, exercise real cookies and permissions, and remove their database fixtures. Passwords are not printed. Provider playback is stubbed; this does not verify live YouTube access. Screenshots are in docs/screenshots.

## Storage and deployment boundaries

Local photos are outside the database and web public directory, stored in uploads, decoded/reencoded to WebP, and served through authenticated ownership/record checks. Optional Azure Blob storage is supported by AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER; provision a **private** container beforehand. Azure integration has not been tested against a live account.

This rebuild uses local account authentication. Microsoft Entra SSO is not implemented in this version. Do not treat it as configured enterprise SSO. See docs/security.md for the verified controls and production requirements. A deployed private HTTPS service, durable storage, backups, ingress limits, monitoring, and organizational review are needed before workplace production use.

## Performance and packaging

See [docs/performance.md](docs/performance.md) for measured before/after sizes and verification. Section bundles load on demand; startup requests fetch only overview data and private message summaries. Visible tabs poll small summaries or active timers, and hidden tabs stop polling. Closed downtime history rows are memoized rather than recalculated on each clock tick. PostgreSQL connections are reused with a four-connection pool, and local Docker PostgreSQL uses conservative memory settings. Migration 003 adds history/expiry indexes without rewriting work records. Only expired sessions and rate-limit entries are pruned during startup.

Raw Excel exports stage committed rows on private temporary disk and read records in batches of 100, preserving all authorized records across page boundaries. Leadership exports remain separate, reflecting the selected department/date report.

For a reproducible source archive from Git, run npm run package:source; it packages the committed HEAD into dist/Floorwork-source.zip and honors .gitattributes exclusions. Local uncommitted changes, dependencies, build output, private configuration, photos, and the screenshot gallery are not included.

The tablet/security update adds migrations 004 and 005; back up data before upgrading and review the new dashboard permission on custom role policies. Deployment templates are provided but have not changed your host firewall or published a live site.

The dashboard/problem-solving update adds migration 006. It preserves existing records and grants the new `problems` capability to existing valid policies; review grants after upgrading.

## Downtime locations and user assignments

Downtime recording uses **department → area → machine** dropdowns. Department choices include the plant to distinguish duplicate names. Changing a parent clears the child selection, and selecting a currently-down machine card restores its full location.

As Admin, open **Accounts**, select an existing user, and use **Downtime location access**. Choose unrestricted access or assign whole departments, areas, specific machines, or a combination. Empty restricted assignments block all downtime recording. Whole-location grants include future machines in that location; explicit machine grants follow the machine if it moves. Migration 009 adds workspace assignments above the downtime-specific scope; see the upgrade note at the top. Admin retains full access.

Assignments are enforced on start/stop requests, live timers, operational history and raw downtime exports. Revocation takes effect on the next request, including stopping existing timers; another authorized person or Admin can stop a timer after its starter loses access. Leadership/department dashboards require their role grants and are narrowed by workspace assignments. Only Admin can edit accounts or assignments. Other operational modules also enforce workspace department/area assignments.

Run `npm run test:downtime-access` against a local production app to verify the hierarchy, assignment editing, immediate revocation, unauthorized starts/stops and scoped reads/exports. Back up data before upgrading; preserve your existing `.env`, uploads and database volume.

## Shift alerts, photo evidence and factory integrations

**Shift requirements** lets managers schedule standard-work families by shift and weekday, either once per machine or once per assigned operator. Choose manager/supervisor recipients and independently switch in-app and email alerts on/off. Monitoring begins with the next full shift after activation. Late completions do not erase a missed-shift alert. **Accounts** now stores notification email addresses. SMTP remains unconnected until IT supplies private relay settings; pending email is queued, retried, and visible in the service status.

Required per-step photos are already enforced by the server. Managers with Analytics/Audits access can view linked saved evidence, now with inline previews in expanded records. Unlinked photos and other operators’ photos remain private.

The Admin-only **Integrations** section creates keyed sources and maps external machine IDs to Floorwork equipment. An authenticated webhook accepts down/running transitions; the optional Microsoft SQL Server/Azure SQL bridge reads an approved event view. Neither is a preconfigured connection to your TrakSYS 11.1 installation. Read [the IT setup guide](docs/factory-integrations.md) for the exact event/view contract, email setup, worker service and remaining validation.

Migration 008 adds these tables and preserves existing users and records. `npm start` and the Windows launcher start the shift/integration worker. Custom hosting must also run it (or use `FLOORWORK_WORKER_MODE=external` and manage the worker as a separate service). New verification: `npm run test:connected`, `npm run background:once`. Native Windows, company Azure SQL, TrakSYS and SMTP-provider connectivity still require target-environment testing.
