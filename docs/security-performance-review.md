# Security, device readiness and resource review

Review date: November 13, 2026. This is a source/dependency review with local automated checks, not an independent penetration-test certification or a promise that an app cannot be compromised. Company hosting, identity, backups and real integrations still need IT acceptance.

## Changes in this release

| Finding | Change |
| --- | --- |
| Azure's transitive fast-xml-parser 5.11.2 had a newly reported quadratic CPU parsing advisory | Updated the compatible locked package to 5.12.1 and its required parser dependencies. The full npm audit reported zero known advisories after updating. Recheck at each release. |
| Video range requests read an entire video into memory, then copied it into a response | Authorized video playback now streams only the requested byte range from disk/private Azure Blob, with backpressure and cancellation. Local buffering uses 64 KiB chunks and a byte-sized queue. A 10-byte range no longer requires reading a 32 MiB local video. |
| Device video uploads used base64 JSON | New clients send the original binary file, avoiding 33% base64 wire overhead and the large string/JSON copies. Existing base64 clients remain supported. Both paths enforce authentication, request origin, format, size and concurrency limits. |
| Caddy's 12 MB body cap blocked otherwise allowed videos | Proxy template accepts up to 48 MB; app endpoints retain their stricter individual limits (32 MiB video, 8 MiB photo, etc.). Only the video endpoint accepts raw video. |
| AI/MaintainX responses were size-checked only after buffering or not capped | Response bodies now have actual byte limits, a read deadline and cancellation before JSON parsing. Redirects remain disabled for credential-bearing external API calls. |
| Password changes had no separate per-account attempt budget | Added five attempts per 15 minutes, on top of bounded password hashing concurrency. Malformed stored hashes fail safely. |
| Security events were not consistently logged | Fixed event IDs record sign-in success/failure, password changes/resets, logout/revocation, origin rejection and initial rate-limit crossings. Metadata is allowlisted; usernames are hashed for failed-login correlation. Bodies, passwords, session/recovery/source tokens, emails and Authorization headers are excluded. |
| One MaintainX error path forwarded arbitrary exception messages | It now preserves expected authorization errors but returns a fixed public failure for unexpected network/database errors. Unexpected error names are sanitized before logging. |
| External feeds created and closed connection pools every poll | Bounded pools are reused by engine/configuration identity; failed connects are evicted and retired/removed configurations close pools. SQL Server/PostgreSQL certificate verification stays enabled, queries stay parameterized, and PostgreSQL reads use read-only transactions with rollback on failure. |
| Repeated linear membership scans in imports/timer annotations | Uses Sets for allowed-equipment and active-binding membership. Permissions and source keys are still checked fresh; authorization results are not cached. |
| Tablet install failure offered little explanation | Persistent installation help now explains trusted HTTPS/browser restrictions and service-worker registration failure. Touch devices get 44 px control targets, 16 px form text to avoid Safari auto-zoom, and safe-area spacing. |

## Security boundaries reviewed

- Cookie sessions use random tokens, hash-only database storage, HttpOnly/SameSite, secure host-only cookies on HTTPS, account-version revocation and forced initial password change.
- Cookie-authenticated writes check the exact configured origin. Codespaces exceptions require the exact running preview, loopback tunnel, browser origin proof and same-origin Fetch Metadata. The integration endpoints instead use source-specific Bearer keys with request limits and payload schemas. Do not make a private preview public to bypass sign-in errors.
- API handlers require current account permissions and equipment/area scope. Managers cannot turn ordinary departmental account rights into global Admin privileges. Account changes are recorded in AccountAudit without passwords. Integration source keys are returned only on creation/rotation, not lists.
- Database values use Prisma bound parameters or driver parameters. The small number of dynamic SQL view names pass strict identifier allowlists; the browser cannot submit SQL queries or connection credentials. Imported values do not alter account/permission tables.
- React renders user content as text. No user HTML is injected with `innerHTML`/`dangerouslySetInnerHTML`; no user code is evaluated. URLs/media IDs use specific allowed formats. The production CSP blocks arbitrary scripts, frames are limited to approved video hosts, and responses use nosniff, frame restrictions and private/no-store where appropriate. Escaping is context-specific, not a blanket encode/decode pass that would damage saved observations.
- Uploads have byte/concurrency limits, basic container validation and protected access. Photos are decoded/re-encoded and metadata removed. Videos are served with video content types and nosniff; they are not executed by the server. Keep browser/OS codecs patched; uploaded videos are not a certified antivirus scan.
- XLSX imports reject macros, external links, formulas and unsupported object cells, and check archive expansion/CRC limits. Imported rows are schema-validated and location-scoped. Exports are disk-backed, paged, bounded, private and cancelled/cleaned if abandoned.
- Background jobs use bounded independent async loops without creating threads per user. A failing mail job does not block shifts/SQL. Password hashing, image conversion, workbook imports and exports already have concurrency limits. Source/runtime scripts run trusted packaged code; request bodies and documents are never shell commands.
- SMTP uses verified TLS. OpenAI navigation has no database/tool execution and receives only the typed question plus permitted help. External AI remains optional/Admin-enabled. Do not submit confidential production information to it without company approval.

## Resource budgets and operation

One app process uses a PostgreSQL pool capped at four connections; the separate worker has its own pool of four. The company downtime bridge is capped at two SQL connections. Each configured external feed connection is capped at one, with at most 20 configurations (shared keys can reuse a pool). Do not run a worker for every tablet or extra duplicate workers. Idle external connections can close after 60 seconds; timeout/batch limits prevent unlimited imports.

Deploy production builds; do not run the development compiler for workplace use. Keep Caddy gzip/zstd enabled for compressible HTML/JSON/assets. MP4/XLSX/JPEG are already compressed; do not repeatedly recompress them. Browser polling pauses in hidden tabs and does not overlap itself. Dashboard totals are calculated in PostgreSQL; loaded rows and exports are paged. There is no new browser cache of private records or credentials; offline support is a public reconnect notice only.

No hardware sizing guarantee is made for 100 accounts. Measure real concurrent users, upload sizes and history volume. Start staging with one maintained app host and a private database, record process RSS/CPU, DB connection count, query latency, API p50/p95, export duration and video network throughput. Increase capacity only when measurements justify it. Monitor disk free space and backups as histories/media grow; retain required audit evidence.

## Release and operations checklist

1. Review and merge the release through the company's normal repository process. Keep source/private configuration separate. `npm ci` installs the locked dependency tree; build on the deployment OS/CPU architecture.
2. Back up PostgreSQL and media and test restore. Apply existing migrations through 014 if not already installed. This hardening release adds no new migration.
3. Build once and run unprivileged supervised app and worker services. Restrict runtime write access to private uploads/temp paths; source and executable files should not be writable by the service account. See deploy service templates. Keep PostgreSQL and integration endpoints private. The local Docker `work/work` database is a development pilot only; provision separate least-privilege production identities.
4. Store secrets privately, rotate source keys and credentials using coordinated cutovers, use trusted TLS certificates, enforce device lock/MDM and company network access. Use a stable HTTPS subdomain; keep APP_ORIGIN exact.
5. Capture structured stdout/stderr in the company's log service with access control and retention. Failed-login subject hashes are pseudonymous security metadata. Do not enable request-body/header debug logging or expose server logs to ordinary app users. AccountAudit remains in the database for authorized Admin review. Audit payload histories can include business/employee data; treat backups accordingly.
6. Run the verification commands below and perform physical iPad/Windows acceptance plus real staging SQL/TrakSYS tests with IT. Full Entra SSO/MFA is not implemented; company access gateways/MDM do not turn the local account system into native SSO.

```bash
npm audit
npm run typecheck
npm test
npm run test:migrations
npm run build
# Start the local test server with FLOORWORK_WORKER_MODE=external npm start
npm run test:security
npm run test:browser
npm run test:locations
npm run test:maintenance-data
npm run test:floor-expansion
npm run test:personal-access
npm run test:centerlines
npm run test:install
npm run test:tablet
npm run test:performance
```

Tests use synthetic local fixtures. Runtime/worker tests disable external transports; they do not validate real SMTP, Azure storage, TrakSYS or company SQL. The dependency scan checks published known advisories, not every possible vulnerability. Keep OS, Node 24 LTS, PostgreSQL, browsers and dependencies patched; schedule an independent review before company-wide production rollout.
