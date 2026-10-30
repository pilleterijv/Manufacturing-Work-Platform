require("dotenv").config({ quiet: true });
const { Pool } = require("pg"),
  { spawnSync } = require("node:child_process"),
  { readFileSync } = require("node:fs"),
  { createHash, randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict");
const database = new URL(process.env.DATABASE_URL || "");
assert(
  ["localhost", "127.0.0.1"].includes(database.hostname),
  "Migration verification only runs on a local database",
);
const parent = new Pool({ connectionString: database.toString() });
const names = [];
function setup(url) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/setup.ts"],
    { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    "Temporary migration verification failed: " + result.stderr,
  );
}
async function main() {
  for (const mode of ["fresh", "upgrade"]) {
    const name = "floorwork_test_" + randomUUID().replaceAll("-", "");
    names.push(name);
    await parent.query(`CREATE DATABASE "${name}"`);
    const url = new URL(database);
    url.pathname = "/" + name;
    const pool = new Pool({ connectionString: url.toString() });
    try {
      if (mode === "upgrade") {
        const sql = readFileSync("prisma/001.sql", "utf8");
        await pool.query(sql);
        await pool.query(
          'CREATE TABLE "Migration" (name TEXT PRIMARY KEY,hash TEXT NOT NULL)',
        );
        await pool.query('INSERT INTO "Migration" VALUES ($1,$2)', [
          "001",
          createHash("sha256").update(sql).digest("hex"),
        ]);
        await pool.query(
          'INSERT INTO "Policy" (role,grants) VALUES ($1,$2),($3,$4)',
          [
            "Manager",
            JSON.stringify(["work"]),
            "Operator",
            JSON.stringify(["studies"]),
          ],
        );
      }
      setup(url.toString());
      setup(url.toString());
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "Migration"')).rows[0]
          .n,
        2,
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n,
        0,
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "Equipment"')).rows[0]
          .n,
        1,
      );
      if (mode === "upgrade") {
        const grants = (
          await pool.query('SELECT grants FROM "Policy" WHERE role=$1', [
            "Manager",
          ])
        ).rows[0].grants;
        assert.deepEqual([...grants].sort(), [
          "downtime",
          "ideas",
          "leadership",
          "work",
        ]);
        const operator = (
          await pool.query('SELECT grants FROM "Policy" WHERE role=$1', [
            "Operator",
          ])
        ).rows[0].grants;
        assert.deepEqual([...operator].sort(), [
          "downtime",
          "ideas",
          "studies",
        ]);
      }
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "DowntimeReason"'))
          .rows[0].n,
        4,
      );
    } finally {
      await pool.end();
    }
  }
  console.log(
    "PASS: fresh installation, upgrade from 001, checksummed repeatability, preserved custom grants, default reasons, and no default user accounts.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const name of names)
      await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await parent.end();
  });
