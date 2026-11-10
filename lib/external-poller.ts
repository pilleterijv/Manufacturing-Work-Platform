import { z } from "zod";
import { Pool } from "pg";
import sql from "mssql";
import { db } from "./db";
import { feedIdentifier } from "./external-rules";
import { ingestExternalRows } from "./external-data";
const configSchema = z
  .array(
    z.object({
      feedId: z.string().uuid(),
      engine: z.enum(["mssql", "postgres"]),
      view: z.string(),
      connectionEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/),
    }),
  )
  .max(20);
// Connections/views are IT-managed server configuration, never URLs or SQL from browser input.
export async function pollExternalData() {
  const configs = configSchema.parse(
    JSON.parse(process.env.EXTERNAL_DATA_FEEDS_JSON || "[]"),
  );
  let imported = 0;
  for (const c of configs) {
    const feed = await db.externalFeed.findUnique({ where: { id: c.feedId } });
    if (!feed?.active || feed.mode !== "api") continue;
    const source = await db.integrationSource.findUnique({
      where: { id: feed.sourceId },
    });
    if (!source?.active) continue;
    try {
      const view = feedIdentifier(c.view),
        credential = process.env[c.connectionEnv];
      if (!credential) throw Error("Missing private connection");
      let rows: { EventSequence: string; Payload: string }[] = [];
      if (c.engine === "postgres") {
        const url = new URL(credential);
        if (!["postgres:", "postgresql:"].includes(url.protocol))
          throw Error("Use a PostgreSQL connection URL");
        for (const key of [
          "ssl",
          "sslmode",
          "sslcert",
          "sslkey",
          "sslrootcert",
        ])
          url.searchParams.delete(key);
        const pool = new Pool({
          connectionString: url.toString(),
          max: 1,
          connectionTimeoutMillis: 10000,
          statement_timeout: 10000,
          ssl: { rejectUnauthorized: true },
        });
        try {
          const [schema, name] = view.split(".");
          const client = await pool.connect();
          try {
            await client.query("BEGIN READ ONLY");
            rows = (
              await client.query(
                `SELECT "EventSequence"::text AS "EventSequence", "Payload"::text AS "Payload" FROM "${schema}"."${name}" WHERE "EventSequence">$1::bigint ORDER BY "EventSequence" LIMIT 100`,
                [feed.cursor],
              )
            ).rows;
            await client.query("COMMIT");
          } finally {
            client.release();
          }
        } finally {
          await pool.end();
        }
      } else {
        const settings = JSON.parse(credential) as sql.config;
        settings.options = {
          ...settings.options,
          encrypt: true,
          trustServerCertificate: false,
        };
        settings.pool = { max: 1, min: 0, idleTimeoutMillis: 10000 };
        settings.requestTimeout = 10000;
        settings.connectionTimeout = 10000;
        const pool = await new sql.ConnectionPool(settings).connect();
        try {
          const [schema, name] = view.split(".");
          rows = (
            await pool
              .request()
              .input("cursor", sql.VarChar(30), feed.cursor)
              .query(
                `SELECT TOP (100) CONVERT(varchar(30),EventSequence) AS EventSequence,Payload FROM [${schema}].[${name}] WHERE EventSequence>CONVERT(bigint,@cursor) ORDER BY EventSequence`,
              )
          ).recordset;
        } finally {
          await pool.close();
        }
      }
      for (const row of rows) {
        if (
          !/^\d{1,19}$/.test(row.EventSequence) ||
          BigInt(row.EventSequence) <= BigInt(feed.cursor)
        )
          throw Error("Invalid event sequence");
        const payload = JSON.parse(row.Payload);
        await ingestExternalRows(
          feed.id,
          [payload],
          source.tokenHash,
          undefined,
          row.EventSequence,
        );
        imported++;
      }
    } catch {
      await db.externalFeed.update({
        where: { id: feed.id },
        data: {
          lastError:
            "Import paused. IT must check the approved read-only view, committed sequence, payload, mappings, TLS and connection settings. Cursor retained for retry.",
        },
      });
    }
  }
  return { imported };
}
