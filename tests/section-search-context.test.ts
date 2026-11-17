import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionEndpoints } from "../lib/section-views";
import { searchSettings, sectionSearch } from "../lib/section-search";
import { recordFilters } from "../lib/filters";
test("every searchable work tab names its actual domain and explains the person role", () => {
  for (const section of [
    ...Object.keys(sectionEndpoints),
    "Manage",
    "Leadership dashboard",
  ]) {
    const c = searchSettings(section);
    assert(c, section);
    assert(c.label.length > 8);
    assert(c.placeholder);
    assert(c.personLabel);
    assert(c.personHelp);
    assert(!/Search this section|Find a person|Task \/ record/.test(c.label));
  }
  assert.equal(
    new Set(Object.values(sectionSearch).map((c) => c.label)).size,
    Object.keys(sectionSearch).length,
  );
  for (const section of [
    "Overview",
    "My account",
    "Dashboard settings",
    "Permissions",
    "constructor",
    "__proto__",
  ])
    assert.equal(searchSettings(section), undefined);
  assert.match(
    searchSettings("Training")!.personHelp!,
    /not training attendance/,
  );
  assert.match(searchSettings("Centerlines")!.personHelp!, /no assigned owner/);
  assert.equal(searchSettings("5S audits")!.equipment, undefined);
  assert.equal(searchSettings("5S audits")!.areas, true);
});
test("centerline historical setup text is included without weakening the recorder filter", () => {
  const where = recordFilters(
    "recorder-id",
    "old SKU",
    [],
    [["centerlineSnapshot", "setup"]],
  );
  assert.equal(where.userId, "recorder-id");
  assert(
    JSON.stringify(where).includes('"path":["centerlineSnapshot","setup"]'),
  );
});
