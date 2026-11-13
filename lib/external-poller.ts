import { createHash } from "node:crypto";
import { ConnectionCache } from "./connection-cache";
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
type Connection =
  | { engine: "postgres"; pool: Pool }
  | { engine: "mssql"; pool: sql.ConnectionPool };
const connections = new ConnectionCache<Connection>(async (c) => {
  if (c.engine === "postgres") await c.pool.end();
  else await c.pool.close();
});
const connectionKey = (engine: string, name: string, value: string) =>
  createHash("sha256")
    .update(JSON.stringify([engine, name, value]))
    .digest("hex");
let pending: Promise<{ imported: number }> | undefined;
export function pollExternalData() {
  if (!pending)
    pending = poll().finally(() => {
      pending = undefined;
    });
  return pending;
}
export async function closeExternalData() {
  await connections.close();
}
// Connections/views are IT-managed server configuration, never URLs or SQL from browser input.
async function poll() {
  const configs = configSchema.parse(
    JSON.parse(process.env.EXTERNAL_DATA_FEEDS_JSON || "[]"),
  );
  await connections.retain(
    new Set(
      configs
        .filter((c) => process.env[c.connectionEnv])
        .map((c) =>
          connectionKey(
            c.engine,
            c.connectionEnv,
            process.env[c.connectionEnv]!,
          ),
        ),
    ),
  );
  const used = new Set<string>();
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
      const key = connectionKey(c.engine, c.connectionEnv, credential);
      used.add(key);
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
        const connection = await connections.get(key, async () => {
          const pool = new Pool({
            connectionString: url.toString(),
            max: 1,
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 10000,
            idle_in_transaction_session_timeout: 15000,
            ssl: { rejectUnauthorized: true },
          });
          pool.on("error", () => {});
          return { engine: "postgres", pool };
        });
        if (connection.engine !== "postgres")
          throw Error("Connection engine mismatch");
        const [schema, name] = view.split("."),
          client = await connection.pool.connect();
        try {
          await client.query("BEGIN READ ONLY");
          rows = (
            await client.query(
              `SELECT "EventSequence"::text AS "EventSequence", left("Payload"::text,524289) AS "Payload" FROM "${schema}"."${name}" WHERE "EventSequence">$1::bigint ORDER BY "EventSequence" LIMIT 100`,
              [feed.cursor],
            )
          ).rows;
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      } else {
        const connection = await connections.get(key, async () => {
          const settings = JSON.parse(credential) as sql.config;
          settings.options = {
            ...settings.options,
            encrypt: true,
            trustServerCertificate: false,
          };
          settings.pool = { max: 1, min: 0, idleTimeoutMillis: 60000 };
          settings.requestTimeout = 10000;
          settings.connectionTimeout = 10000;
          const pool = new sql.ConnectionPool(settings);
          pool.on("error", () => {});
          await pool.connect();
          return { engine: "mssql", pool };
        });
        if (connection.engine !== "mssql")
          throw Error("Connection engine mismatch");
        const [schema, name] = view.split(".");
        rows = (
          await connection.pool
            .request()
            .input("cursor", sql.VarChar(30), feed.cursor)
            .query(
              `SELECT TOP (100) CONVERT(varchar(30),EventSequence) AS EventSequence,LEFT(Payload,524289) AS Payload FROM [${schema}].[${name}] WHERE EventSequence>CONVERT(bigint,@cursor) ORDER BY EventSequence`,
            )
        ).recordset;
      }
      for (const row of rows) {
        if (
          !/^\d{1,19}$/.test(row.EventSequence) ||
          BigInt(row.EventSequence) <= BigInt(feed.cursor)
        )
          throw Error("Invalid event sequence");
        if (
          typeof row.Payload !== "string" ||
          Buffer.byteLength(row.Payload) > 512 * 1024
        )
          throw Error("Feed payload is too large");
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
  await connections.retain(used);
  return { imported };
}
