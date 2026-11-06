import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedDowntimeEquipment as allowed,
  departmentKey,
} from "../lib/downtime-access-rules";
const machine = {
  id: "18fc7968-6b12-4881-8cc4-8389cef38d26",
  plant: "North",
  department: "Assembly",
  area: "Packing",
};
test("downtime assignments are additive and plant-scoped", () => {
  const access = {
    mode: "restricted",
    locations: [{ plant: "North", department: "Assembly", area: "Packing" }],
    equipmentIds: [],
  };
  assert(allowed("Operator", access, machine));
  assert(!allowed("Operator", access, { ...machine, plant: "South" }));
  assert(!allowed("Operator", access, { ...machine, area: "Welding" }));
  assert(
    allowed(
      "Operator",
      {
        ...access,
        locations: [{ plant: "North", department: "Assembly", area: null }],
      },
      { ...machine, area: "Welding" },
    ),
  );
  assert(
    allowed(
      "Operator",
      { ...access, locations: [], equipmentIds: [machine.id] },
      { ...machine, plant: "South" },
    ),
  );
  assert.notEqual(
    departmentKey(machine),
    departmentKey({ ...machine, plant: "South" }),
  );
});
test("no assignments or malformed access deny recording; Admin remains unrestricted", () => {
  for (const raw of [
    null,
    {},
    { mode: "restricted", locations: [], equipmentIds: [] },
    { mode: "unknown", locations: [], equipmentIds: [] },
  ])
    assert(!allowed("Operator", raw, machine));
  assert(allowed("Admin", null, machine));
  assert(
    allowed(
      "Operator",
      { mode: "all", locations: [], equipmentIds: [] },
      machine,
    ),
  );
  assert(
    allowed(
      "Operator",
      {
        mode: "restricted",
        locations: [{ plant: "North", department: "Assembly", area: "" }],
        equipmentIds: [],
      },
      { ...machine, area: "" },
    ),
  );
});
