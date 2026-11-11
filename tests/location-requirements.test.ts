import { test } from "node:test";
import assert from "node:assert/strict";
import { closureErrors, defaultRequirements } from "../lib/problem-rules";
import { allowedDowntimeEquipment } from "../lib/downtime-access-rules";
test("multi-area workspace assignments remain plant-specific and fail closed", () => {
  const e = { id: "one", plant: "North", department: "Packing", area: "A" };
  const a = {
    mode: "restricted",
    locations: [
      { plant: "North", department: "Packing", area: "A" },
      { plant: "North", department: "Packing", area: "B" },
    ],
    equipmentIds: [],
  };
  assert(allowedDowntimeEquipment("Manager", a, e));
  assert(allowedDowntimeEquipment("DL/TL", a, { ...e, area: "B" }));
  assert(!allowedDowntimeEquipment("Manager", a, { ...e, plant: "South" }));
  assert(!allowedDowntimeEquipment("Manager", {}, e));
  assert(!allowedDowntimeEquipment("Operator", { ...a, locations: [] }, e));
});
test("closure distinguishes optional fields/actions and required action categories", () => {
  const requirements = {
    fields: ["problem"],
    actionTypes: ["Containment", "Corrective", "Preventive"],
    requireAction: true,
  };
  const actions = requirements.actionTypes.map((type) => ({
    type,
    status: "Completed",
    required: true,
  }));
  assert.deepEqual(
    closureErrors(
      "2D",
      { problem: "Known issue" },
      [...actions, { type: "Correction", status: "Open", required: false }],
      requirements,
    ),
    [],
  );
  assert(
    closureErrors(
      "2D",
      { problem: "Known issue" },
      actions.slice(0, 2),
      requirements,
    ).some((e) => e.includes("Preventive")),
  );
  assert(
    closureErrors("4D", {}, [], {
      ...requirements,
      fields: [],
      actionTypes: [],
      requireAction: false,
    }).length === 0,
  );
  assert(!defaultRequirements("2D").fields.includes("preventive"));
  assert(defaultRequirements("4D").fields.includes("preventive"));
});
