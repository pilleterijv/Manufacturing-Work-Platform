# Connect TrakSYS and company databases

This is an IT handover guide. No live company connection has been made. Use a staging machine/source first. The known host is **pharmsql.database.windows.net** and the supplied TrakSYS version is **11.1.1.15411**. IT must confirm the actual SQL database name and which licensed TrakSYS interfaces are available. The app does not assume that this TrakSYS version exposes a particular API URL.

## 1. Establish the app host

Deploy one always-on company server behind trusted HTTPS. Configure the exact public `APP_ORIGIN`, private PostgreSQL `DATABASE_URL`, durable private media storage and the background worker. PostgreSQL stores this app's own accounts and records; Microsoft SQL Server is a separate read-only data source. Do not put the Azure SQL hostname into `DATABASE_URL`.

Allow the app/worker server to reach approved SQL/API endpoints. PCs/iPads need access only to the app's HTTPS address. For Azure SQL, use the company's approved private endpoint/VPN or tightly scoped firewall policy; do not enable broad internet access merely to make a test work. SQL TLS certificate validation is enforced. Install the approved private CA on the server where needed; never set `trustServerCertificate=true` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 2. Choose the downtime connection method

Use **one authoritative method per machine**. A SQL bridge is simple when IT can expose an ordered event view. A gateway push avoids SQL credentials in this app when an approved TrakSYS API/event connector is available.

### Option A — TrakSYS gateway pushes events

1. In Floorwork as Admin, open **Integrations → Add integration source**. Name the staging source and choose **Create source & key**. Store the returned key directly in the gateway's secret manager. The key is shown once; use Rotate key if lost. Never put it in browser code, a query string, email or chat.
2. Add machines to the app catalog with their canonical departments/areas. Create an active automatic downtime reason.
3. In **Map a machine**, select the source, enter the exact TrakSYS machine ID, and choose the Floorwork machine and automatic reason. A mapping binds that source to that machine. Give each source only its intended machine mappings.
4. IT configures an approved gateway/TrakSYS connector to translate actual machine states into the contract below. This adapter runs server-side, not on the tablet. Confirm with the TrakSYS vendor/administrator how to read events for version 11.1.1.15411; this app supplies the receiving endpoint, not a vendor-specific TrakSYS connector.
5. POST to `https://YOUR-APP-HOST/api/integrations/events` with `Authorization: Bearer SOURCE_KEY` and `Content-Type: application/json`:

```json
{
  "eventId": "stable-source-event-123",
  "machineId": "EXACT-TRAKSYS-MACHINE-ID",
  "state": "down",
  "occurredAt": "2026-11-13T15:00:00.000Z"
}
```

Send a later `running` event with a different stable event ID to end downtime. Use UTC (`Z`) or an explicit timezone offset. Preserve each event ID/payload when retrying; the receiver deduplicates exact retries and rejects an ID reused with changed contents. Deliver events in order per machine. Do not blindly retry validation or mapping errors. Retain failed events in the gateway queue and alert IT. Respect `429` with backoff. A source accepts up to 600 requests/minute and 64 KiB/event. Events older than 366 days or over five minutes in the future are rejected.

6. Pilot a known down/running pair. Verify machine, timestamps, duration, reason and source in Downtime and the integration status. Verify an exact retry creates no second event. Check that the wrong source cannot control that machine. Resolve active manual/different-source timers before automatic control; the app rejects overlapping authority rather than overwriting them.
7. Move to production only after the process owner confirms the result. Rotate source keys using a coordinated gateway update. Disable the source/mapping to stop ingestion; this does not silently end an existing machine timer.

### Option B — Read-only SQL downtime view

1. Complete the same Floorwork source/machine mappings above. Copy the source UUID from Integrations.
2. IT creates an approved read-only projection named, for example, `dbo.FloorworkDowntimeEvents`. Its columns must be:

| Column        | Contract                                                             |
| ------------- | -------------------------------------------------------------------- |
| EventSequence | Positive bigint; committed publication order, strictly increasing    |
| EventID       | Stable event ID, up to 150 characters                                |
| MachineID     | Exact mapped external machine ID, up to 150 characters               |
| State         | `down` or `running`                                                  |
| OccurredAt    | UTC SQL timestamp or timestamp that the driver returns as a UTC Date |

An IDENTITY allocated before a transaction commits does **not** guarantee committed order. IT should expose an ordered outbox/CDC projection and a committed publication watermark so a late commit cannot be skipped. The reader does not rescan old sequence numbers. Start the source cursor only after deciding whether existing history should be imported.

3. IT provisions a dedicated account with SELECT on that view only, not `db_owner`, sysadmin or permission to write production tables. For an already provisioned SQL user, the grant resembles:

```sql
GRANT SELECT ON OBJECT::dbo.FloorworkDowntimeEvents TO [FloorworkReader];
```

The SQL administrator performs the provisioning in the correct database. This is a template, not an instruction to run an unreviewed migration on TrakSYS.

4. Set these values privately on the **worker server** (not GitHub source or device settings):

```dotenv
COMPANY_SQL_SERVER=pharmsql.database.windows.net
COMPANY_SQL_PORT=1433
COMPANY_SQL_DATABASE=IT_CONFIRMED_DATABASE_NAME
COMPANY_SQL_USER=IT_PROVISIONED_READER
COMPANY_SQL_PASSWORD=SET_PRIVATELY
COMPANY_SQL_VIEW=dbo.FloorworkDowntimeEvents
COMPANY_SQL_SOURCE_ID=FLOORWORK_SOURCE_UUID
```

5. Restart the background worker after changing private settings. `npm start` runs a worker automatically unless external-worker mode is selected; the Linux service deployment uses the separate `floorwork-worker.service`. Keep one worker for this deployment. It reads at most 100 events per poll, about every 10 seconds plus processing time, using a pool capped at two connections and 10-second SQL timeouts. This is polling, not a guaranteed zero-latency PLC feed.
6. Verify the SQL status in Integrations and a controlled down/running pair. A rejected event retains the cursor and pauses that batch for retry. Check view access, machine mapping, state, UTC time and event order before advancing or discarding anything. Do not reset the cursor as a troubleshooting shortcut.

## 3. Pull other SQL data into a section

These feeds create **read-only connected-data rows**. They do not automatically create native PM plans, user permissions or corrective actions.

1. Create an integration source in Integrations.
2. In the destination section's **Connected data** panel as Admin, choose **Create external feed**, select that source and the database/API mode. Save its feed UUID. If the desired section has no connected-data adapter, agree a specific native/section adapter rather than writing arbitrary app tables.
3. IT exposes a SELECT-only view with `EventSequence` (committed increasing bigint) and `Payload` (JSON text). PostgreSQL uses quoted `"EventSequence"` and `"Payload"` names. Each Payload maps equipment to a real Floorwork equipment UUID, and person IDs to app accounts when supplied:

```json
{
  "externalId": "production-result-123",
  "equipmentId": "FLOORWORK-EQUIPMENT-UUID",
  "personId": null,
  "title": "Production results",
  "details": "Approved shift result",
  "occurredAt": "2026-11-13T15:00:00.000Z",
  "values": { "produced": 100, "good": 97, "rejects": 3 }
}
```

Use a stable externalId per source record so updates create revisions. Values accept at most 30 scalar fields; no SQL, scripts or executable formulas are evaluated. A source row is limited to 512 KiB before JSON parsing, and normal field limits are smaller.

4. Add private worker configuration, using real UUIDs:

```dotenv
EXTERNAL_DATA_FEEDS_JSON='[{"feedId":"FEED-UUID","engine":"mssql","view":"dbo.FloorworkProductionFeed","connectionEnv":"FLOORWORK_PRODUCTION_CONNECTION"}]'
FLOORWORK_PRODUCTION_CONNECTION='{"server":"pharmsql.database.windows.net","port":1433,"database":"IT_CONFIRMED_DATABASE_NAME","user":"READER","password":"SET_PRIVATELY"}'
```

These lines illustrate raw environment values. Use the deployment secret store; if using a dotenv file, quote/escape JSON and passwords according to that loader so `#`, quotes and backslashes remain intact. `EXTERNAL_DATA_FEEDS_JSON` holds only mappings; each `connectionEnv` points to a separate secret. A PostgreSQL feed uses `"engine":"postgres"`, a schema.view name and a PostgreSQL URL in the named variable. External PostgreSQL feeds require verified TLS too.

5. Restart the worker and inspect the section. It polls up to 100 rows/feed about every 30 seconds plus processing time. Pools are reused and capped at one connection each, with at most 20 configured feeds. Removed/inactive feeds release pools. Values are schema-validated; a bad row retains the cursor for correction. Native app history is not overwritten by imported rows.
6. A gateway can instead POST `{"feedId":"...","sequence":"123","rows":[...]}` to `/api/external-data/rows` with its source's Bearer key. Sequence is a string to preserve 64-bit precision. Limit each request to 1000 rows and 4 MiB. The source cannot write another source's feed.

## 4. Excel production results

Open Production results → Connected data. Create an Excel-mode feed as Admin, download the template, and use canonical equipment/account UUIDs. Columns are ExternalID, EquipmentID, Date, Produced, Good, Rejects, and optional PersonID. Use values, not formulas, macros or links. Good + Rejects must equal Produced. Maximum 8 MiB XLSX, 32 MiB expanded archive, and 1000 data rows. Import as a manager with access to those machines; the import rejects cross-department data.

## 5. Operational checks and troubleshooting

| Symptom                             | First check                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Azure SQL cannot connect            | Server/database name, private DNS/routing/firewall, approved reader, trusted certificate and port 1433               |
| SQL status configured but no data   | Worker running, active source/feed/mapping, rows beyond saved cursor and correct view columns                        |
| API 401                             | Source key present, current, active; no cookies or employee password in the integration gateway                      |
| API 403                             | Source/feed ownership or machine scope; do not grant all departments to bypass it                                    |
| API 409                             | Conflicting timer, stale event/order, changed duplicate or another source; reconcile the underlying state            |
| API 429                             | Back off and reduce rate; retain events for retry                                                                    |
| Browser 401 at a Codespaces preview | GitHub preview authorization; use the company's stable HTTPS host for rollout                                        |
| Worker shows a generic import error | Inspect approved settings and source data privately; application responses intentionally omit SQL/connection details |

Log event identifiers, source/machine mapping IDs, timestamps and fixed status codes in the gateway. Redact Authorization headers, tokens, passwords, connection strings and payloads with personal/production data. Monitor cursor progress and queue age, not only whether the worker process exists. Back up the app database and media; test restore before production rollout.
