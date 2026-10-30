# Floorwork — Manufacturing Work Platform

A browser application for standard work, photographic evidence, time studies, supervisor audits, troubleshooting, training, role permissions, downtime tracking, improvement ideas, leadership reporting, and Excel exports. PostgreSQL is the primary database; Excel is an export format.

## Download and run on Windows

The rebuilt application is on the **codex/rebuild-floorwork** branch, not main until you merge it.

1. Open https://github.com/pilleterijv/Manufacturing-Work-Platform/tree/codex/rebuild-floorwork and choose **Code → Download ZIP**.
2. Install **Node.js 24 LTS** from https://nodejs.org/ and **Docker Desktop** from https://www.docker.com/products/docker-desktop/. Choose Docker **AMD64** for Intel/AMD computers or ARM64 for ARM computers. Follow Docker's Windows/WSL prerequisites and start Docker Desktop.
3. Extract the ZIP completely. Double-click **START-FLOORWORK.cmd** inside the extracted folder.
4. On first launch, enter your own administrator username, display name, and temporary password in the console. Password entry is hidden. There is no default app account.
5. Open **http://localhost:3000 on your own computer** after startup. Sign in, replace the temporary password, and sign in again. Keep the console window open.

The launcher installs dependencies, generates Prisma's JS client, starts local PostgreSQL, applies a checksummed migration, seeds example equipment/standard/guide, creates an Admin only when needed, builds, and starts the application. It preserves existing .env files and accounts, refuses nonlocal database configuration, binds the app and database to loopback, and never disables Windows protections or certificate checks. Native Windows execution still requires validation on a Windows machine; the application is tested in Chromium on Linux.

To stop the app, press Ctrl+C in its console. To start again, run the launcher. **Do not delete Docker volumes or the uploads folder**; these hold your data and photos. Back them up together. The database password in the local Docker example is development configuration, not an app login.

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
- **Leadership dashboard:** workspace-wide and department-level summaries of work, studies, audits, downtime, ideas, standards, training, guides, and equipment. Default reporting period is 30 local calendar days, with a maximum 366-day range. Period metrics and current library/pipeline counts are labeled separately. Reporting uses complete queried records, rather than the 2,000-record operational history cap. Department filters are reporting tools, not access restrictions. Admin and Manager have leadership access by default; Admin can edit role grants.
- **Improvement ideas:** current state, proposal, equipment/department, due date, submitter, pilot, validator, and participants. Creator identity is always recorded separately. The pilot receives a **private in-app notification**, created in the same transaction as the idea. Notifications refresh every 20 seconds while signed in and can be marked read. Email delivery is not configured. Pilot/validator can update progress; only the validator or Admin can mark completed. Ideas are shared within the workspace among people with the ideas permission.
- **Access:** individual accounts, Admin/Manager/DL-TL/Operator roles, editable role policies checked by the server on every request, forced initial/reset password change, account reset/deactivation, remembered sessions, and session revocation.
- **Analytics/Excel:** completed records, No-answer rates, failures by equipment/step, elapsed completion time, timing statistics, audit follow-ups; up to nine XLSX sheets with raw observations. A scheduled completion percentage is not available because there is no scheduling module. Dashboard displays the latest 2,000 accessible records; exports include all accessible records.

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
