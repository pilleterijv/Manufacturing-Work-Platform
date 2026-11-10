# PMs, people filters, evidence and connected data

## Find people and search records

The filter bar in each section provides a name/username directory search, a person selector, a text search, Apply and Clear. It never broadens capabilities or department/area assignments. The server applies filters before record pagination; exports carry the same selected person/text filters. Configuration screens without person-owned operational records still use their own controls.

Person means recorder for execution/history, author for new library resources, relevant pilot/validator/submitter/participant for ideas, facilitator/reviewer/action owner for problem cases, assignee for PM plans and performer for PM history. The problem action queue filters action owners. Equipment/standard choices use assignment. Existing library records without author metadata remain visible under Anyone; their authors are not guessed or backfilled. Person IDs on external results are optional, so rows without a mapped person appear under Anyone.

Private notification inboxes remain personal. Managers/DL/TLs can filter the permitted department's overdue delivery report by recipient; selecting another person does not reveal that person's private idea inbox. Account and role administration remains Admin-only.

## Preventive maintenance

Open Preventive maintenance. Managers with Manage can create/edit plans: machine, assignee, task steps, first due date, interval in calendar days and optional per-step required evidence. Staff must be assigned to the machine's location. Maintenance is added to existing operational-role policies by migration 010; review role grants after upgrading.

Only the assigned person or Admin completes a PM. Every step requires an explicit Yes/No. Evidence requirements accept a photo or video. PMs cannot be completed before their due date; managers can deliberately reschedule a plan for early service. Duplicate/stale submissions fail rather than advancing the schedule twice. Completion saves the plan version, machine snapshot, scheduled due date, answers, comments, performer and evidence before advancing the next due date. Late completion advances along the plan's original calendar interval to the next future due date. A No answer marks the completion for follow-up; it does not assert a successful inspection.

Plan edits and pauses retain completion snapshots/history. The screen shows the latest 100 matching completions; its PM export includes the complete matching history. Do not hard-delete user/equipment records linked to history; deactivate/archive them.

## Photos and device videos

Device videos work in Training, troubleshooting guides, operator/DL/TL evidence, PMs, ideas, and problem/action evidence. Training still accepts supported HTTPS YouTube/Vimeo links. Photos remain JPEG/PNG/WebP up to 8 MB; videos are MP4/WebM/MOV up to 32 MB. Browser codec support varies; MP4/H.264 is recommended for iPads. The file chooser can select files from the device; this is not a dedicated video recorder/editor.

Standard/DL/TL steps retain one photo and one video slot. A required evidence flag can be satisfied by either type. PM/idea/problem/guide inputs support bounded attachment lists. Controls block saving while uploads are pending, and file extension fallback handles devices that omit a MIME type; the server still validates actual image decoding/video container signatures. Guide photo markup is preserved.

Uploads stay outside public files, in private local storage or a private Azure container. Every read checks a currently permitted linked record. A PM capability does not grant access to someone else's standard-work evidence. Draft uploads remain private to the uploader; ownership does not override the location/capability checks of a linked record. Videos support authenticated byte ranges; invalid zero-length suffix ranges return 416. Media is not cached offline. Configure durable storage, quotas, backup/retention and ingress body limits. Video delivery currently buffers a capped file; production sizing must include simultaneous playback.

## Overdue messages and email

Open Notifications → Overdue work reminders. Each person can toggle personal in-app/email reminders. Admin can toggle company channels. Automatic checks run every minute on the background worker and deduplicate once per entity/due date/local day/recipient. Managers/DL/TLs can queue their currently permitted department scope manually and narrow it to a selected person.

Recipients are the idea pilot/validator, problem facilitator/reviewer, action owner or PM assignee, plus assigned department/area managers. Location access and module capability are required. Closed/completed work, reassignment, changed due dates, disabled recipients/channels and revoked access are checked again before queued mail is sent. Missing addresses or delivery errors retry with backoff and eventually show Failed. Mail uses the existing approved SMTP relay configuration, not an email app on each tablet. Shift-specific missed-work alert switches remain separate.

No real company email was sent or tested. Tests use a local transport stub/stream. IT must configure and validate the relay and addresses before enabling production delivery. At-least-once delivery and stable Message-IDs reduce duplicates but cannot guarantee exactly-once inbox delivery or receipt.

## External data, Excel and company ownership

See [company-ownership-deployment.md](company-ownership-deployment.md) for the exact Excel template, read-only SQL Server/PostgreSQL view contracts, source-key API, TrakSYS mapping, hosting, secrets, ownership and licensing steps. Production results has its own connected-results export, with location columns and numeric production quantities.

Connected data is a separate read-only source layer in each operational section. It does not rewrite native tasks, user permissions or completed work. Excel becomes normalized PostgreSQL records; prior changed imports remain in ExternalRevision. An import cannot take over an external ID currently belonging to another department. Ordered API/database sequences and row changes commit together; old/replayed sequences cannot replace newer results. SQL connections use approved SELECT-only views and private server configuration.

## Review fixes and regression checks

This change fixes/prevents:

- invalid video byte-range handling;
- a 2D action edit bypassing its checkpoint restriction;
- mixed-media permissions accidentally broadening standard-work evidence access;
- pending/concurrent uploads allowing premature save or lost attachments;
- stale responses/pagination mixing records after quick filter/tab changes;
- nested evidence lookups exhausting the transaction connection pool;
- duplicate PM completion/early completion and implicit unchecked PM answers;
- source replay/order races, false revisions from JSON object-key order, and cross-department external-ID takeover;
- workbook expansion attacks, including forged ZIP size metadata, with bounded actual inflation and checksums;
- packaged workers accidentally depending on browser request-header modules;
- standalone worker initialization reading database configuration before `.env` was loaded;
- migration credentials accidentally targeting a different database/server;
- spreadsheet calendar dates shifting backward when viewed from US timezones;
- unsafe long numeric external IDs losing Excel precision, ambiguous duplicate headers, formulas/macros/external links and partial forbidden batches.

Validation commands:

- `npm run build` (includes TypeScript and portable runtime preparation)
- `npm test` (31 unit tests, including forged-size archive rejection)
- `RUNTIME_DIR=<isolated-runtime-copy> npm run test:runtime` (bundled account creation, hidden prompts, required WASM, private-file exclusions and env-file-only worker startup)
- `npm run test:migrations` (fresh and legacy upgrades through 010, preserved raw history/custom grants, repeat checksums)
- `npm run test:browser`, `test:operations`, `test:tablet`, `test:problems`, `test:downtime-access`, `test:locations`, `test:connected`
- `npm run test:maintenance-data` (new API/browser workflows, real file input video upload, private evidence, scoped exports, Excel atomicity/revisions, bigint source order, overdue recipient routing and cancellation)
- `npm audit --omit=dev` (zero known production dependency vulnerabilities at review time; not a security certification)

All browser data and mail recipients are temporary synthetic fixtures. New captures are in [screenshots/maintenance-data](screenshots/maintenance-data). Test FFmpeg is used only to generate synthetic video; employees do not need it.

Not verified: native Windows execution, real company TrakSYS/SQL/SMTP connectivity, production restore/load tests, or an independent penetration test. Entra SSO/MFA remains an implementation gap. Follow the IT pilot/deployment guidance before company-wide use.
