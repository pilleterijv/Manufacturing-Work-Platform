import "dotenv/config";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../lib/db";
import { defaults } from "../lib/rules";
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7543921)");
    await client.query(
      'CREATE TABLE IF NOT EXISTS "Migration" (name TEXT PRIMARY KEY, hash TEXT NOT NULL)',
    );
    const migrations = (await readdir("prisma"))
      .filter((name) => /^\d{3}\.sql$/.test(name))
      .sort();
    for (const file of migrations) {
      const name = file.slice(0, -4),
        sql = await readFile(`prisma/${file}`, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query(
        'SELECT hash FROM "Migration" WHERE name=$1',
        [name],
      );
      if (prior.rowCount) {
        if (prior.rows[0].hash !== hash)
          throw Error("Applied migration checksum changed");
      } else {
        await client.query(sql);
        await client.query('INSERT INTO "Migration" VALUES ($1,$2)', [
          name,
          hash,
        ]);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  for (const [role, grants] of Object.entries(defaults))
    await db.policy.upsert({
      where: { role },
      create: { role, grants },
      update: {},
    });
  if (!(await db.equipment.count())) {
    const e = await db.equipment.create({
      data: {
        name: "Packing station 01",
        plant: "Main plant",
        department: "Production",
        area: "Assembly",
        line: "Line A",
      },
    });
    await db.standard.create({
      data: {
        family: crypto.randomUUID(),
        revision: 1,
        title: "Packing station start-up",
        equipmentId: e.id,
        target: 45,
        tolerance: 10,
        steps: [
          {
            id: "guard",
            text: "Verify guards and emergency stop are ready",
            photo: false,
          },
          {
            id: "materials",
            text: "Confirm correct labels and packaging materials",
            photo: true,
          },
          {
            id: "first-piece",
            text: "Inspect and approve the first packed unit",
            photo: false,
          },
        ],
      },
    });
    await db.content.create({
      data: {
        kind: "guide",
        title: "Label alignment troubleshooting",
        equipmentId: e.id,
        body: "1. Stop the station safely and follow your approved isolation procedure.\n2. Check the label roll and guides against the approved setup.\n3. Ask the team leader to verify alignment.\n4. Run and inspect a first piece before restarting production.",
      },
    });
  }
  await db.session.deleteMany({ where: { expires: { lt: new Date() } } });
  await db.rate.deleteMany({ where: { expires: { lt: new Date() } } });
  console.log("Database ready. No application accounts were created.");
}
main()
  .catch(() => {
    console.error(
      "Database setup failed. Check PostgreSQL and the configured database.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
