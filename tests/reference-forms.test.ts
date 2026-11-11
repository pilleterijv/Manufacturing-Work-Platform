import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceDepartments,
  referenceAreas,
  leaderStarter,
} from "../lib/reference-catalog";
import {
  methodology,
  defaultRequirements,
  closureErrors,
  answersSchema,
} from "../lib/problem-rules";
import { hasSectionSearch } from "../lib/section-views";
test("reference taxonomy uses supplied exact areas, not workbook placeholders", () => {
  assert.equal(referenceDepartments.length, 17);
  assert.deepEqual(referenceAreas.Tableting, [
    "Compressing",
    "Coating",
    "Mezzanine",
    "Upstairs Blending",
    "Bin Blending",
    "Weigh Room",
    "Coordinator's Office",
  ]);
  assert.equal(referenceAreas.Packaging.length, 8);
  assert.equal(referenceAreas.Softgel.length, 5);
  assert.equal(referenceAreas.Gummies.length, 6);
  assert.equal(referenceAreas.Warehouse.length, 7);
  assert(referenceAreas["Maintenance/Facilities"].includes("MRO"));
  assert(referenceAreas.Planning.includes("Tech Ops"));
  assert(!JSON.stringify(referenceAreas).includes("Add locations here"));
  assert(
    leaderStarter.every(([group, text, timing]) => group && text && timing),
  );
});
test("second 4D root cause is independent and optional until required by the author", () => {
  const req = defaultRequirements("4D"),
    answers = Object.fromEntries(
      req.fields.map((k) => [k, "Verified evidence"]),
    );
  assert(!req.fields.includes("rootCause2"));
  const actions = [{ status: "Completed", type: "Corrective" }];
  assert.deepEqual(closureErrors("4D", answers, actions), []);
  const second = { ...req, fields: [...req.fields, "rootCause2"] };
  const pending = {
    ...answers,
    secondRootCauseEnabled: "Yes",
    why1b: "Independent cause",
  };
  assert(
    closureErrors("4D", pending, actions, second).includes(
      "Root cause path 2 · Root cause summary",
    ),
  );
  assert.deepEqual(
    closureErrors(
      "4D",
      { ...pending, rootCause2: "Second verified cause" },
      actions,
      second,
    ),
    [],
  );
  assert(
    answersSchema.safeParse({ ...pending, rootCause2: "Second verified cause" })
      .success,
  );
  assert(
    !answersSchema.safeParse({ unknownPrivateField: "unrecognized" }).success,
  );
});
test("8D supplied form fields cover sponsor, customer impact, fishbone, optional Whys and prevention departments", () => {
  const fields = methodology["8D"].sections.flatMap((s) =>
    s.fields.map(([k]) => k),
  );
  for (const key of [
    "nccapa",
    "sku",
    "sponsor",
    "severity",
    "occurrence",
    "internalExternal",
    "emergencyNeeded",
    "who",
    "what",
    "when",
    "where",
    "howMuch",
    "whyCare",
    "desiredDifference",
    "why6",
    "why7",
    "rootCause2",
    "fishboneMachine",
    "fishboneEnvironment",
    "preventionQualityAssurance",
    "preventionMaintenance",
    "recognition",
  ])
    assert(fields.includes(key), key);
  assert(!defaultRequirements("8D").fields.includes("why7"));
});
test("search is available on working lists but absent from profile and configuration screens", () => {
  for (const name of [
    "Overview",
    "Dashboard settings",
    "Assistant",
    "My account",
    "Permissions",
    "Locations",
    "Accounts",
    "Integrations",
    "Shift requirements",
  ])
    assert(!hasSectionSearch(name), name);
  for (const name of [
    "DL/TL Standard Work",
    "Standard work audits",
    "Time studies",
    "Problem solving",
    "Troubleshooting",
  ])
    assert(hasSectionSearch(name), name);
});
