import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  centerlineSchema,
  readingResult,
  type CenterlineParameter,
} from "../lib/centerline-rules";
import { effectiveGrants } from "../lib/delegation-rules";
import { canOpenSection } from "../lib/navigation";
import { sectionSnapshot } from "../lib/section-snapshot";
const p: CenterlineParameter = {
  id: randomUUID(),
  name: "Feed speed",
  kind: "numeric",
  unit: "rpm",
  lower: 90,
  target: 100,
  upper: 110,
  expected: "",
  instructions: "Use approved gauge",
  photo: false,
};
const profile = {
  title: "Press setup",
  equipmentId: randomUUID(),
  setup: "SKU 1",
  notes: "",
  parameters: [p],
};
test("centerline numeric readings retain precision and inclusive bounds; empty/coerced/nonfinite values fail", () => {
  for (const n of ["90", "110", "1e2", "100.125"])
    assert.equal(readingResult(p, n).withinLimits, true);
  for (const n of ["89.99", "110.01", "-100"])
    assert.equal(readingResult(p, n).withinLimits, false);
  for (const n of [
    "",
    " ",
    "0x64",
    "Infinity",
    "NaN",
    "100 rpm",
    "1,000",
    "1e999",
    "1000000000001",
  ])
    assert.throws(() => readingResult(p, n));
  assert.equal(readingResult(p, " 100.125 ").value, 100.125);
});
test("centerline definitions require complete ordered numeric limits or an expected setting, and unique parameter names/IDs", () => {
  assert(centerlineSchema.safeParse(profile).success);
  for (const patch of [
    { target: null },
    { lower: 101 },
    { upper: 99 },
    { target: Infinity },
    { kind: "text", expected: " " },
  ])
    assert(
      !centerlineSchema.safeParse({
        ...profile,
        parameters: [{ ...p, ...patch }],
      }).success,
    );
  assert(
    !centerlineSchema.safeParse({ ...profile, parameters: [p, p] }).success,
  );
  assert(
    !centerlineSchema.safeParse({
      ...profile,
      parameters: [p, { ...p, id: randomUUID(), name: "FEED SPEED" }],
    }).success,
  );
  assert.equal(
    readingResult(
      { ...p, kind: "text", expected: "Position A" },
      " position a ",
    ).withinLimits,
    true,
  );
  assert.equal(
    readingResult({ ...p, kind: "text", expected: "Closed" }, "Open")
      .withinLimits,
    false,
  );
});
test("centerline delegation opens only the new section; dashboard totals are full-history counts", () => {
  const g = effectiveGrants("Operator", [], [], ["centerlines.manage"]);
  assert.deepEqual(g, ["centerlines"]);
  assert(canOpenSection({ role: "Operator", grants: g }, "Centerlines"));
  assert(!canOpenSection({ role: "Operator", grants: [] }, "Centerlines"));
  const snapshot = sectionSnapshot("Centerlines", {
    summary: { active: 150, total: 1000, followUps: 42 },
    records: [],
  });
  assert.deepEqual(
    snapshot.metrics.map((x) => x.value),
    [150, 1000, 42],
  );
});
