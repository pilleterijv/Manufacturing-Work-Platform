# Floorwork — Manufacturing Work Platform

A browser application for standard work, photographic evidence, time studies, supervisor audits, troubleshooting, training, role permissions, downtime tracking, improvement ideas, leadership reporting, and Excel exports. PostgreSQL is the primary database; Excel is an export format.

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

- **Standard work:** latest revisions, ordered Yes/No steps, required/optional photos and comments, completion history, timestamped records, and frozen standard snapshots.
- **Time studies:** named work elements, repeated stopwatch observations, raw seconds/timestamps, average, median, minimum, maximum, range, and population standard deviation per element.
- **Supervisor audits:** operator identification, Yes/No findings, photographic evidence, repeated cycle timing, target+tolerance checks, follow-up flags, and original criteria retained per audit.
- **Training:** searchable equipment-associated YouTube/Vimeo links, trusted embed URLs, playback on demand, and archive. Uploaded MP4 hosting and certification tracking are not implemented.
- **Troubleshooting:** searchable plain-text guides with equipment association and archive.
- **Management:** equipment hierarchy, standard authoring and immutable revision history. Existing runs and audits are never rewritten when a standard changes.
- **Downtime:** Admin-managed reasons and timer availability; shared start/stop timer per equipment; server timestamps survive reloads; no overlapping active events for a machine. Configure 1–8 daily shifts and an IANA time zone. Events split across shift boundaries, overnight dates, and daylight-saving changes, using the schedule and reason/equipment snapshots saved when they started.
- **Leadership dashboard:** workspace-wide and department-level summaries of work, studies, audits, downtime, ideas, standards, training, guides, and equipment. Default reporting period is 30 local calendar days, with a maximum 366-day range. Period metrics and current library/pipeline counts are labeled separately. Reporting uses complete queried records, rather than the paged operational histories. Department filters are reporting tools, not access restrictions. Admin and Manager have leadership access by default; Admin can edit role grants.
- **Improvement ideas:** current state, proposal, equipment/department, due date, submitter, pilot, validator, and participants. Creator identity is always recorded separately. The pilot receives a **private in-app notification**, created in the same transaction as the idea. Notifications refresh every 20 seconds while signed in and can be marked read. Email delivery is not configured. Pilot/validator can update progress; only the validator or Admin can mark completed. Ideas are shared within the workspace among people with the ideas permission.
- **Access:** individual accounts, Admin/Manager/DL-TL/Operator roles, editable role policies checked by the server on every request, forced initial/reset password change, account reset/deactivation, remembered sessions, and session revocation.
- **Analytics/Excel:** completed records, No-answer rates, failures by equipment/step, elapsed completion time, timing statistics, audit follow-ups; up to nine XLSX sheets with raw observations. A scheduled completion percentage is not available because there is no scheduling module. Overview displays eight recent records with exact totals; work histories load 100 records per page with a Load more history button. Statistics in the Analytics section reflect loaded history; leadership reports and exports query their complete scope.

## Verification

```sh
npm run typecheck
npm test
npm audit
# Start the production build in a separate terminal, then:
npm run test:browser
npm run test:operations
# Optional local PostgreSQL verification (requires CREATE DATABASE permission):
npm run test:migrations
```

Browser tests require Chromium (CHROMIUM_PATH defaults to /usr/bin/chromium), a local database, and a running production app at APP_URL (default http://localhost:3000). Tests create random temporary accounts, exercise real cookies and permissions, and remove their database fixtures. Passwords are not printed. Provider playback is stubbed; this does not verify live YouTube access. Screenshots are in docs/screenshots.

## Storage and deployment boundaries

Local photos are outside the database and web public directory, stored in uploads, decoded/reencoded to WebP, and served through authenticated ownership/record checks. Optional Azure Blob storage is supported by AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER; provision a **private** container beforehand. Azure integration has not been tested against a live account.

This rebuild uses local account authentication. Microsoft Entra SSO is not implemented in this version. Do not treat it as configured enterprise SSO. See docs/security.md for the verified controls and production requirements. A deployed private HTTPS service, durable storage, backups, ingress limits, monitoring, and organizational review are needed before workplace production use.

## Performance and packaging

See [docs/performance.md](docs/performance.md) for measured before/after sizes and verification. Section bundles load on demand; startup requests fetch only overview data and private message summaries. Visible tabs poll small summaries or active timers, and hidden tabs stop polling. Closed downtime history rows are memoized rather than recalculated on each clock tick. PostgreSQL connections are reused with a four-connection pool, and local Docker PostgreSQL uses conservative memory settings. Migration 003 adds history/expiry indexes without rewriting work records. Only expired sessions and rate-limit entries are pruned during startup.

Raw Excel exports stream committed rows and read records in batches of 100, preserving all authorized records across page boundaries. Leadership exports remain separate, reflecting the selected department/date report.

For a reproducible source archive from Git, run npm run package:source; it packages the committed HEAD into dist/Floorwork-source.zip and honors .gitattributes exclusions. Local uncommitted changes, dependencies, build output, private configuration, photos, and the screenshot gallery are not included.
