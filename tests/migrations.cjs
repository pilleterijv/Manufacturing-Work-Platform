require("dotenv").config({ quiet: true });
const { Pool } = require("pg"),
  { spawnSync } = require("node:child_process"),
  { readFileSync } = require("node:fs"),
  { createHash, randomUUID } = require("node:crypto"),
  assert = require("node:assert/strict");
const database = new URL(process.env.DATABASE_URL || "");
assert(
  ["localhost", "127.0.0.1"].includes(database.hostname),
  "Migration verification only runs on a local database"
);
const parent = new Pool({ connectionString: database.toString() });
const names = [];
function setup(url) {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/setup.ts"], {
    env: { ...process.env, DATABASE_URL: url, DATABASE_SETUP_URL: url },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, "Temporary migration verification failed: " + result.stderr);
}
async function main() {
  for (const mode of ["fresh", "upgrade", "upgrade003", "upgrade020"]) {
    const name = "floorwork_test_" + randomUUID().replaceAll("-", "");
    names.push(name);
    await parent.query(`CREATE DATABASE "${name}"`);
    const url = new URL(database);
    url.pathname = "/" + name;
    const pool = new Pool({ connectionString: url.toString() });
    try {
      if (mode !== "fresh") {
        const sql = readFileSync("prisma/001.sql", "utf8");
        await pool.query(sql);
        await pool.query('CREATE TABLE "Migration" (name TEXT PRIMARY KEY,hash TEXT NOT NULL)');
        await pool.query('INSERT INTO "Migration" VALUES ($1,$2)', [
          "001",
          createHash("sha256").update(sql).digest("hex"),
        ]);
        await pool.query('INSERT INTO "Policy" (role,grants) VALUES ($1,$2),($3,$4)', [
          "Manager",
          JSON.stringify(["work"]),
          "Operator",
          JSON.stringify(["studies"]),
        ]);
      }
      const raw = {
        snapshot: { revision: 1 },
        responses: [{ stepId: "guard", answer: true, photo: "preserved-photo" }],
        durationSeconds: 12,
      };
      if (mode === "upgrade003") {
        for (const version of ["002", "003"]) {
          const sql = readFileSync(`prisma/${version}.sql`, "utf8");
          await pool.query(sql);
          await pool.query('INSERT INTO "Migration" VALUES ($1,$2)', [
            version,
            createHash("sha256").update(sql).digest("hex"),
          ]);
        }
        await pool.query(
          `INSERT INTO "User" (id,username,name,password,role) VALUES ('preserved-user','preserved-user','Preserved fixture','non-login-fixture','Operator')`
        );
        await pool.query(
          `INSERT INTO "Equipment" VALUES ('preserved-equipment','Station','Plant','Assembly','Packing','Line A')`
        );
        await pool.query(
          `INSERT INTO "Equipment" VALUES ('variant-equipment','Legacy variant',' plant ',' assembly ',' packing ',' line a ')`
        );
        await pool.query(`INSERT INTO "Photo" (id,"userId") VALUES ('preserved-photo','preserved-user')`);
        await pool.query(
          `INSERT INTO "Record" (id,kind,"userId",data) VALUES ('preserved-record','run','preserved-user',$1)`,
          [JSON.stringify(raw)]
        );
        await pool.query(
          `INSERT INTO "Idea" (id,title,"equipmentId","equipmentSnapshot","currentState",proposal,"dueDate","createdBy","submitterId","pilotId","validatorId") VALUES ('preserved-idea','Preserved idea','preserved-equipment',$1,'Before','After','2026-12-01','preserved-user','preserved-user','preserved-user','preserved-user')`,
          [
            JSON.stringify({
              id: "preserved-equipment",
              department: "Assembly",
              area: "Packing",
              line: "Line A",
            }),
          ]
        );
      }
      if (mode === "upgrade020") {
        for (let n = 2; n <= 20; n++) {
          const version = String(n).padStart(3, "0"),
            sql = readFileSync(`prisma/${version}.sql`, "utf8");
          await pool.query(sql);
          await pool.query('INSERT INTO "Migration" VALUES ($1,$2)', [
            version,
            createHash("sha256").update(sql).digest("hex"),
          ]);
        }
        await pool.query(
          `INSERT INTO "User" (id,username,name,password,role) VALUES ('case-user','case-user','Preserved user','non-login-fixture','Operator')`
        );
        await pool.query(
          `INSERT INTO "Equipment" (id,name,plant,department,area,line) VALUES ('case-machine','Preserved machine','Plant','Dept','Area','')`
        );
        await pool.query(
          `INSERT INTO "Problem" (id,reference,method,title,"equipmentId","equipmentSnapshot","occurredOn","reportedBy","ownerId","reviewerId",team,"dueDate",answers,"createdBy",history) VALUES ('preserved-case','2D-PRESERVED','2D','Preserved case','case-machine','{}','2026-11-18','Preserved user','case-user','case-user','Typed team','2026-11-20','{"problem":"Historical evidence"}','case-user','[{"event":"Created"}]')`
        );
      }
      setup(url.toString());
      setup(url.toString());
      if (mode === "upgrade020") {
        const record = (
          await pool.query(
            `SELECT title,answers,history,"participantIds",team FROM "Problem" WHERE id='preserved-case'`
          )
        ).rows[0];
        assert.deepEqual(record, {
          title: "Preserved case",
          answers: { problem: "Historical evidence" },
          history: [{ event: "Created" }],
          participantIds: [],
          team: "Typed team",
        });
      }
      if (mode === "upgrade003") {
        assert.deepEqual(
          (await pool.query(`SELECT data FROM "Record" WHERE id='preserved-record'`)).rows[0].data,
          raw
        );
        assert.deepEqual(
          (await pool.query(`SELECT "downtimeAccess" FROM "User" WHERE id='preserved-user'`)).rows[0]
            .downtimeAccess,
          { mode: "all", locations: [], equipmentIds: [] }
        );
        assert.equal(
          (await pool.query(`SELECT password FROM "User" WHERE id='preserved-user'`)).rows[0].password,
          "non-login-fixture"
        );
        const idea = (await pool.query(`SELECT title,process FROM "Idea" WHERE id='preserved-idea'`)).rows[0];
        assert.deepEqual(idea, { title: "Preserved idea", process: "" });
        assert.equal(
          (
            await pool.query(
              `SELECT count(*)::int AS n FROM "Record" WHERE kind IN ('run','audit') AND (data->'responses') @> $1::jsonb`,
              [JSON.stringify([{ photo: "preserved-photo" }])]
            )
          ).rows[0].n,
          1
        );
      }
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Migration"')).rows[0].n, 21);
      const participantColumn = await pool.query(
        `SELECT column_default FROM information_schema.columns WHERE table_name='Problem' AND column_name='participantIds'`
      );
      assert.match(participantColumn.rows[0].column_default, /\[\]/);
      const roleMetadata = await pool.query('SELECT role,"baseRole" FROM "Policy" ORDER BY role');
      for (const row of roleMetadata.rows) assert.equal(row.baseRole, row.role);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "RoleAudit"')).rows[0].n, 0);
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "User" WHERE "customRole" IS NOT NULL')).rows[0].n,
        0
      );
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Centerline"')).rows[0].n, 0);
      const standardColumns = (
        await pool.query(
          `SELECT column_name, column_default FROM information_schema.columns WHERE table_name='Standard' AND column_name IN ('workflow','archived') ORDER BY column_name`
        )
      ).rows;
      assert.equal(standardColumns.length, 2);
      assert.match(standardColumns[0].column_default, /false/);
      assert.match(standardColumns[1].column_default, /process/);
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "Problem"')).rows[0].n,
        mode === "upgrade020" ? 1 : 0
      );
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "ProblemAction"')).rows[0].n, 0);
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n,
        ["upgrade003", "upgrade020"].includes(mode) ? 1 : 0
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "Equipment"')).rows[0].n,
        mode === "upgrade003" ? 2 : 1
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM "Location"')).rows[0].n,
        1,
        "Canonical catalog tolerates legacy whitespace/case variants without changing equipment history"
      );
      if (mode === "upgrade") {
        const grants = (await pool.query('SELECT grants FROM "Policy" WHERE role=$1', ["Manager"])).rows[0]
          .grants;
        assert.deepEqual([...grants].sort(), [
          "centerlines",
          "dashboard",
          "defects",
          "downtime",
          "fiveS",
          "ideas",
          "leadership",
          "maintenance",
          "problems",
          "work",
        ]);
        const operator = (await pool.query('SELECT grants FROM "Policy" WHERE role=$1', ["Operator"])).rows[0]
          .grants;
        assert.deepEqual([...operator].sort(), [
          "dashboard",
          "defects",
          "downtime",
          "fiveS",
          "ideas",
          "maintenance",
          "problems",
          "studies",
        ]);
      }
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "DowntimeReason"')).rows[0].n, 4);
    } finally {
      await pool.end();
    }
  }
  console.log(
    "PASS: fresh installation, upgrades from 001, 003 and 020, preserved cases/answers/teams/history plus accounts/raw records/photos/ideas, checksummed repeatability, custom grants, and no default user accounts."
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const name of names) await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await parent.end();
  });
