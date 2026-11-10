const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
async function databaseReady(root, env = process.env) {
  if (!env.DATABASE_URL)
    throw Error(
      "DATABASE_URL is missing. Configure the app's private environment file first.",
    );
  const url = new URL(env.DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol))
    throw Error("DATABASE_URL must use PostgreSQL.");
  // Only the original Codespaces pilot's known local Compose database is managed here.
  const localPilot =
    env.CODESPACES === "true" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    (url.port || "5432") === "5432" &&
    decodeURIComponent(url.pathname) === "/work_rebuild" &&
    decodeURIComponent(url.username) === "work";
  if (localPilot && fs.existsSync(path.join(root, "compose.yaml"))) {
    console.log("Ensuring the local pilot PostgreSQL database is running…");
    const started = spawnSync("docker", ["compose", "up", "-d", "db"], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    if (started.error || started.status !== 0)
      throw Error(
        "The local PostgreSQL container could not start. Run docker compose up -d db to inspect Docker's error. If Docker reports an existing runtime ID, recreate only the db container with docker compose rm --stop --force db, then start it again. Keep the named data volume; do not use -v or volume pruning.",
      );
  }
  let pg;
  try {
    pg = require(path.join(root, ".floorwork/runtime/node_modules/pg"));
  } catch {
    pg = require("pg");
  }
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
  try {
    let last;
    for (let i = 0; i < (localPilot ? 12 : 1); i++) {
      try {
        await pool.query("SELECT 1");
        last = null;
        break;
      } catch (e) {
        last = e;
        if (["28P01", "3D000"].includes(e.code)) break;
        if (localPilot) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (last) throw last;
    const applied = await pool.query('SELECT name FROM "Migration"');
    const expected = fs
      .readdirSync(path.join(root, "prisma"))
      .filter((n) => /^\d{3}\.sql$/.test(n))
      .map((n) => n.slice(0, -4));
    const seen = new Set(applied.rows.map((r) => r.name));
    if (expected.some((n) => !seen.has(n)))
      throw Object.assign(Error("schema"), { code: "42P01" });
    console.log("PostgreSQL is ready; application migrations are present.");
  } catch (e) {
    if (["42P01", "42703"].includes(e.code))
      throw Error(
        "PostgreSQL is reachable, but application setup is incomplete. Run npm run db:setup using this same environment, then start the app again. Existing records will be preserved.",
      );
    if (e.code === "28P01")
      throw Error(
        "PostgreSQL rejected the credentials. Check private DATABASE_URL settings; do not paste credentials into chat.",
      );
    throw Error(
      "PostgreSQL is unavailable. Check the configured database host and that its service is running. For the local pilot, run docker compose ps and docker compose up -d db. The app and background worker were not started.",
    );
  } finally {
    await pool.end();
  }
}
module.exports = { databaseReady };
