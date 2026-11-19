import { test } from "node:test";
import assert from "node:assert/strict";
import { tabletingLeaderTemplates, handoffRooms } from "../lib/tableting-leader";
import { standardSchema } from "../lib/rules";
import { leaderHandoffSchema } from "../lib/leader-handoff-rules";
import { referenceDepartments, referenceAreas } from "../lib/reference-catalog";
test("four supplied Tableting documents retain task counts, thresholds and distinctive checks", () => {
  assert.deepEqual(
    tabletingLeaderTemplates.map((t) => t.steps.length),
    [35, 30, 29, 38]
  );
  for (const t of tabletingLeaderTemplates) {
    standardSchema.parse({
      kind: "audit",
      workflow: "leader",
      handoffProfile: t.key,
      title: t.title,
      equipmentId: "fixture",
      target: 1,
      tolerance: 0,
      steps: t.steps,
    });
    assert(t.steps.some((s) => /downtime exceeding 1 hour/.test(s.text)));
    assert(t.steps.every((s) => s.group && s.timing && !s.photo));
    assert(referenceAreas.Tableting.includes(t.area));
  }
  const all = tabletingLeaderTemplates.map((t) => t.steps.map((s) => s.text).join("\n"));
  assert(all[0].includes("IPR 3.5–6; Korsch <50"));
  assert(all[1].includes("FIFO"));
  assert(all[2].includes("3 clean bins"));
  assert(all[3].includes("11.1 Verify that the air-knife is working"));
  assert(all[3].includes("20–30%"));
  assert(all[3].includes("60–65 rpm"));
});
test("handoffs use source room labels and preserve specific validated fields", () => {
  assert.equal(handoffRooms("compressing").length, 10);
  assert.deepEqual(
    handoffRooms("coating").map((r) => r.room),
    ["CC1", "CC2", "AC3", "AC4"]
  );
  assert.deepEqual(
    handoffRooms("weigh-room").map((r) => r.room),
    ["Weigh Room A", "Weigh Room B", "Weigh Room C", "Weigh Room D", "Bin Blending", "Inspection"]
  );
  const value = {
    shift: "Shift 1",
    notes: "Fixture",
    rooms: [
      {
        ...handoffRooms("coating")[2],
        round: "3",
        totalRounds: "6",
        solutionMixed: "Yes",
        lastFourRecalculated: "No",
      },
    ],
  };
  assert.deepEqual(leaderHandoffSchema.parse(value), value);
  assert(
    !leaderHandoffSchema.safeParse({
      ...value,
      rooms: [{ ...value.rooms[0], solutionMixed: "Maybe" }],
    }).success
  );
  assert.equal(referenceDepartments.length, 17);
  assert.equal(new Set(referenceDepartments).size, 17);
  assert(!referenceDepartments.includes("Add option"));
});
