# Shift alerts and factory-system integration

## What is implemented

- Required photo evidence is enforced in standard-work/audit submissions. Saved record details include inline previews. Managers with the corresponding Analytics/Audits capability can view linked evidence; other operators and anonymous requests cannot. Temporary, unlinked uploads remain private.
- Shift requirements select standard-work family, shifts, weekdays, optional individual assignees, manager/supervisor recipients and two independent notification channels. No assignees means one completion per machine per shift; a list means one completion for every listed person.
- A background worker checks ended shifts approximately once a minute while running. It stores an immutable outcome and creates a recipient’s in-app notification and/or durable email outbox entry in the same database transaction. A unique key and row locks prevent duplicate alerts from concurrent/repeated checks.
- Integration sources have random Bearer keys (stored hashed and shown only at creation/rotation), active/disabled switches and explicit external-machine mappings. Machine events record source timestamps, source provenance and the existing shift snapshots. Idempotent receipts prevent retry duplication; reused IDs with changed payloads, out-of-order timestamps, unknown machines and overlapping/manual timers are rejected.
- The optional Microsoft SQL Server/Azure SQL bridge uses encrypted, certificate-validated connections, a two-connection pool, bound cursor parameters and a fixed SELECT against an approved schema.view. It does not write to the company database. SQL and the app’s PostgreSQL database remain separate.

## TrakSYS 11.1 connection

The supplied TrakSYS version is **11.1.1.15411**. Parsec describes REST, SQL and other integration options at <https://www.parsec-corp.com/integrations>. That does not prove which interfaces/licenses/configurations are enabled in this installation.

IT or the TrakSYS integrator must confirm the supported interface and provide a mapping of external machine IDs. No proprietary TrakSYS 11.1 endpoint, schema or licensing entitlement is assumed by this implementation. The app is prepared to receive translated state transitions; it is not yet connected to a live TrakSYS site.

### Webhook contract

Create a source in **Integrations**, store its one-time key in the sending system’s secret settings, and map each external machine to a Floorwork machine and default downtime reason. The source owner must remain an active Admin account; use a company-managed service administrator for long-lived integrations.

Send to `POST https://YOUR_APP_HOST/api/integrations/events`:

```http
Authorization: Bearer YOUR_PRIVATE_INTEGRATION_KEY
Content-Type: application/json
```

```json
{
  "eventId": "stable-unique-upstream-event-id",
  "machineId": "external-machine-identifier",
  "state": "down",
  "occurredAt": "2026-11-06T16:00:00Z"
}
```

Send a new `running` event when the machine recovers. IDs must be stable across retries, and transition timestamps must increase per machine. Send **state changes**, not high-frequency machine samples/heartbeats. Live events are limited to the last 366 days and at most five minutes in the future. The endpoint has a 64 KiB body limit and a 600-request/minute per-source limit. It uses Bearer authentication instead of browser cookie/Origin authentication; preserve the app’s public Host through its reverse proxy.

Accepted retries return `duplicate: true`. Fix/retry rejected events; do not discard them silently. The source’s existing automatic timer stays unchanged on validation/conflict errors. The current bridge uses the mapping’s default reason; it does not import a complete external reason hierarchy or segmented reason changes.

Automatic timers are not manually stoppable while their source and mapping remain enabled. For an adapter outage, Admin can disable the source or mapping, after which an otherwise-authorized user can stop the timer. Resume with the sender’s current state and correct timestamps. No machine/PLC control commands are sent.

Webhook writes are immediate after receipt. Visible Downtime tabs refresh their live data every five seconds; SQL polling runs approximately every ten seconds plus processing/network time. This is near-real-time monitoring, not a hard real-time control system.

### Read-only Microsoft SQL / Azure SQL view

IT supplies the actual server, database and a dedicated login restricted to **SELECT on one approved view**. Private connection values belong in deployment secrets or `.env`; never in GitHub or chat. Use the generic entries in `.env.example`; no company hostnames, credentials or SQL data are included in source.

The view contract is:

| Column          | Required meaning                                                         |
| --------------- | ------------------------------------------------------------------------ |
| `EventSequence` | Unique increasing positive SQL `bigint`, suitable as an ingestion cursor |
| `EventID`       | Stable unique event ID, up to 150 characters                             |
| `MachineID`     | Mapped external machine ID, up to 150 characters                         |
| `State`         | `down` or `running`                                                      |
| `OccurredAt`    | UTC timestamp or `datetimeoffset` preserving the actual event instant    |

Default view: `dbo.FloorworkDowntimeEvents`. IT chooses how to translate TrakSYS’s actual schema into that contract, and should expose events from the agreed commissioning date rather than an unreviewed historical backfill. This application does not create or alter a company view.

The sequence must represent a committed, ordered feed. An identity value allocated before a transaction commits is not by itself a guarantee of commit order: a late lower-numbered row could be skipped after the cursor advances. IT must provide a suitable outbox/CDC publisher or other ordered event feed; the connector does not enable SQL change tracking or CDC itself.

The worker reads at most 100 rows per cycle in sequence order. Cursor values remain strings end-to-end to preserve SQL bigint precision. It advances the saved cursor only after successfully accepting a row; a bad/unmapped/conflicting event stops that batch so IT can resolve and retry it. SQL health and errors are visible in Integrations. Two workers cannot move the SQL cursor backwards, but deploy one worker per environment to avoid redundant polling.

Set privately:

- `COMPANY_SQL_SERVER`, `COMPANY_SQL_DATABASE`, `COMPANY_SQL_USER`, `COMPANY_SQL_PASSWORD`
- `COMPANY_SQL_SOURCE_ID` from Integrations
- Optional `COMPANY_SQL_PORT` (1433), `COMPANY_SQL_VIEW` (the approved `schema.view`)

This first connector uses SQL login authentication. Managed identity/Entra authentication is not configured by this work. IT must permit the app host’s network access using approved Azure SQL firewall/private-endpoint/VPN routing. No public database exposure or certificate-validation bypass is needed or implemented.

## Shift definitions and deadlines

Each requirement snapshots the timezone and shift definition at creation. If shifts change, pause the old requirement and create a replacement. Shifts crossing midnight and daylight-saving transitions use actual instants. Weekday selection uses the day the shift starts. The first monitored interval is the first full shift starting after activation; resuming a paused requirement starts a new effective period rather than notifying for paused time.

A completion must be a persisted standard-work run within `[shift start, shift end)`, for the scheduled machine/family and (when specified) assignee. Older revisions than the one effective at shift start do not satisfy the requirement. Newer revisions still use their own server-enforced photo checks. A completion at/after the deadline cannot erase the stored missed outcome. This is completion monitoring, not a quality-pass percentage or a production scheduling engine.

The worker catches up in bounded batches after downtime (up to 100 schedules and 100 ended windows per schedule per cycle). Alerts can therefore be later after a large backlog. In-app recipients refresh on their next notification poll; they must be signed in to see them.

## Email delivery and switches

Add notification email addresses under **Accounts**. Choose recipients and channels under **Shift requirements**. Managers/supervisors can have in-app, email, both, or neither for each requirement. Disabling email or pausing a requirement cancels its queued/failed email messages; it does not recall a message already handed to SMTP or delete existing in-app alerts.

Configure an approved SMTP relay using `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and (if needed) `SMTP_USER`/`SMTP_PASSWORD`. Port 587 requires STARTTLS; port 465 uses `SMTP_SECURE=true`. Certificate verification stays enabled. There is no Graph/Exchange OAuth setup in this change; IT must supply a relay/authentication method supported by these settings.

If SMTP is absent, email stays queued and the UI says it is not connected. Failed sends use exponential backoff (up to one hour) with a maximum of ten attempts. Fix the relay then use **Retry failed emails**. Message IDs are stable across retries, but SMTP delivery remains at-least-once: a crash after provider acceptance and before marking Sent can cause a duplicate. No live email-provider delivery is claimed until tested with IT.

## Running and supervising the worker

`npm start` and `START-FLOORWORK.cmd` launch the worker alongside the app. A custom deployment can set `FLOORWORK_WORKER_MODE=external` and separately supervise `node .floorwork/runtime/tools/background-worker.cjs` using the same private environment. Restart failed processes and monitor the last-check timestamps displayed in Shift requirements and Integrations. `npm run background:once` performs one local cycle for diagnostics.

SQL polling, shift checks and email delivery run in separate periodic loops. Each job waits for its own previous run, preventing overlapping runs of that job; a slow or failing email relay does not delay the other services.

The worker must stay running; closing the console, sleeping the host, or stopping the service pauses checks and SQL polling. Notifications do not rely on a manager’s browser being open. Existing installations must run migration 008 before starting the updated app/worker.

## Validation boundaries and sizing

Automated tests cover photo-required enforcement/manager privacy, DST/overnight deadlines, per-person versus station completion, duplicate prevention, channel switches, local generated email/retry behavior, Bearer authentication/key rotation, event ordering/idempotency, conflict protection and SQL cursor precision/retry. SMTP-provider, TrakSYS 11.1 and company Azure SQL connectivity require target-environment tests with approved settings. Windows launcher changes are syntax-checked; native Windows execution remains unverified.

For approximately 100 registered users, an initial 4-vCPU/8-GB shared application/database host is a planning starting point, not a measured production-capacity guarantee. Simultaneous activity, photograph volume, SQL event rate, reporting and availability requirements determine final sizing. App account counts do not create per-seat software fees; hosting, storage, backups, IT operations and existing TrakSYS/SQL/mail licensing are separate costs.

### Local verification note (November 6, 2026)

The prepared runtime passed a burst of 100 concurrent authenticated read requests (half live downtime, half record overview) using one temporary operator session and an empty/synthetic dataset: 100 successful responses, 1,293 ms median, 1,464 ms 95th percentile, 1,468 ms maximum on this shared 2-vCPU/8-GB development environment. This is a read-path smoke test, not a representative 100-user production capacity test: it does not cover concurrent photo uploads, report generation, a large database or live SQL/mail providers. An earlier run overlapping a production build had 16 timeouts/errors out of 100; build and prepare updates away from the live serving workload, then validate representative plant traffic on the chosen host.
