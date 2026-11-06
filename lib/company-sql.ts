import sql from "mssql";
import { db } from "./db";
import { ingestMachineEvent } from "./integrations";
import { sqlViewName, sqlSequence } from "./integration-rules";
let pool: sql.ConnectionPool | undefined;
export function companySqlConfigured() {
  return !!(
    process.env.COMPANY_SQL_SERVER &&
    process.env.COMPANY_SQL_DATABASE &&
    process.env.COMPANY_SQL_USER &&
    process.env.COMPANY_SQL_PASSWORD &&
    process.env.COMPANY_SQL_SOURCE_ID
  );
}
export function companySqlConfig(): sql.config {
  return {
    server: process.env.COMPANY_SQL_SERVER!,
    port: Number(process.env.COMPANY_SQL_PORT || 1433),
    database: process.env.COMPANY_SQL_DATABASE!,
    user: process.env.COMPANY_SQL_USER!,
    password: process.env.COMPANY_SQL_PASSWORD!,
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 10000,
    requestTimeout: 10000,
  };
}
export async function pollCompanySql() {
  if (!companySqlConfigured()) return { configured: false, processed: 0 };
  const source = await db.integrationSource.findUnique({
    where: { id: process.env.COMPANY_SQL_SOURCE_ID },
  });
  if (!source?.active) return { configured: true, processed: 0 };
  const view = sqlViewName(
    process.env.COMPANY_SQL_VIEW || "dbo.FloorworkDowntimeEvents",
  );
  let processed = 0;
  try {
    if (!pool?.connected) {
      if (pool) await pool.close().catch(() => {});
      pool = await new sql.ConnectionPool(companySqlConfig()).connect();
    }
    const result = await pool
      .request()
      .input("lastSequence", sql.VarChar(30), sqlSequence(source.sqlCursor))
      .query(
        `SELECT TOP (100) CONVERT(varchar(30), EventSequence) AS EventSequence, EventID, MachineID, State, OccurredAt FROM ${view} WHERE EventSequence > CONVERT(bigint, @lastSequence) ORDER BY EventSequence ASC`,
      );
    processed = await processSqlRows(source.id, result.recordset);
    await db.setting.upsert({
      where: { key: "company-sql-health" },
      create: {
        key: "company-sql-health",
        value: { checkedAt: new Date().toISOString(), processed, ok: true },
      },
      update: {
        value: { checkedAt: new Date().toISOString(), processed, ok: true },
      },
    });
  } catch {
    await db.integrationSource.update({
      where: { id: source.id },
      data: {
        lastError:
          "SQL import paused. Check the approved view, credentials, network access, mappings and event order; the cursor was retained for retry.",
      },
    });
    await db.setting.upsert({
      where: { key: "company-sql-health" },
      create: {
        key: "company-sql-health",
        value: { checkedAt: new Date().toISOString(), processed, ok: false },
      },
      update: {
        value: { checkedAt: new Date().toISOString(), processed, ok: false },
      },
    });
  }
  return { configured: true, processed };
}
export async function closeCompanySql() {
  await pool?.close();
  pool = undefined;
}

export async function processSqlRows(
  sourceId: string,
  rows: {
    EventSequence: unknown;
    EventID: unknown;
    MachineID: unknown;
    State: unknown;
    OccurredAt: unknown;
  }[],
) {
  let processed = 0;
  for (const row of rows) {
    const sequence = sqlSequence(row.EventSequence);
    await ingestMachineEvent(sourceId, {
      eventId: String(row.EventID),
      machineId: String(row.MachineID),
      state: String(row.State).trim().toLowerCase(),
      occurredAt: new Date(row.OccurredAt as string).toISOString(),
    });
    await db.$executeRaw`UPDATE "IntegrationSource" SET "sqlCursor"=${sequence} WHERE id=${sourceId} AND "sqlCursor"::bigint < ${sequence}::bigint`;
    processed++;
  }
  return processed;
}
