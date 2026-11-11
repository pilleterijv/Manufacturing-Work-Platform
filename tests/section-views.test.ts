import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionSnapshot } from "../lib/section-snapshot";
import { hasSectionViews } from "../lib/section-views";
import { serviceIssue } from "../lib/service-errors";
test("section dashboards distinguish whole-history counts from capped loaded rows", () => {
  const snapshot = sectionSnapshot("Time studies", {
    overview: { runs: 0, studies: 501, audits: 0, followUps: 3 },
    records: [
      {
        id: "one",
        kind: "study",
        data: {
          title: "Packing observation",
          equipmentId: "machine",
          cycles: [{ seconds: 3 }, { seconds: 7 }],
        },
        user: { name: "Taylor" },
        created: "2026-11-10T12:00:00Z",
      },
    ],
    equipment: [{ id: "machine", name: "Packing station" }],
  });
  assert.equal(snapshot.metrics[0].value, 501);
  assert.equal(
    snapshot.metrics.find((m) => m.label === "Observations shown")?.value,
    2,
  );
  assert.equal(
    snapshot.metrics.find((m) => m.label === "Mean cycle shown (seconds)")
      ?.value,
    5,
  );
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].title, "Packing observation");
  assert.equal(snapshot.rows[0].equipment, "Packing station");
  assert.equal(snapshot.buckets[0].count, 1);
  assert(snapshot.note.includes("records loaded"));
  const pm = sectionSnapshot("Preventive maintenance", {
    plans: [
      { active: true, nextDue: "2026-11-09" },
      { active: false, nextDue: "2026-11-09" },
      { active: true, nextDue: "2026-11-11" },
    ],
    today: "2026-11-10",
    records: [],
  });
  assert.equal(pm.metrics.find((m) => m.label === "Due plans shown")?.value, 1);
});
test("operational sections offer both views without adding fake views to account settings", () => {
  for (const name of [
    "Standard work",
    "Time studies",
    "Preventive maintenance",
    "TPM / CIL",
    "5S audits",
    "Defect reporting",
    "Production results",
    "DL/TL Standard Work",
    "Training",
    "Troubleshooting",
    "Downtime",
    "Improvement ideas",
    "Problem solving",
  ])
    assert(hasSectionViews(name));
  assert(!hasSectionViews("Dashboard settings"));
  assert(!hasSectionViews("constructor"));
});
test("database failures expose actionable fixed codes without SQL, URLs or credentials", () => {
  for (const code of [
    "P1001",
    "P2024",
    "ECONNREFUSED",
    "P2021",
    "42P01",
    "28P01",
  ]) {
    const result = serviceIssue({
      code,
      message: "postgresql://user:secret@private/db SQL confidential",
      meta: { query: "private" },
    });
    assert.equal(result.kind, "database");
    assert.equal(result.code, code);
    assert(!JSON.stringify(result).includes("secret"));
    assert(!JSON.stringify(result).includes("confidential"));
  }
  assert(serviceIssue({ code: "P2021" }).message.includes("db:setup"));
  assert.equal(serviceIssue({ code: "password=secret" }).code, "UNKNOWN");
});

test("downtime dashboards retain reason names and distinguish active from ended events", () => {
  const snapshot = sectionSnapshot("Downtime", {
    downtime: [
      {
        id: "event",
        reasonName: "Drive fault",
        startedAt: "2026-11-10T12:00:00Z",
        endedAt: null,
        equipmentSnapshot: { name: "Conveyor" },
        starter: { name: "Jordan" },
      },
    ],
    equipment: [],
  });
  assert.equal(snapshot.rows[0].title, "Drive fault");
  assert.equal(snapshot.rows[0].status, "Active");
  assert.equal(snapshot.rows[0].equipment, "Conveyor");
  assert.equal(snapshot.rows[0].person, "Jordan");
});
