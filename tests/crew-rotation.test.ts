import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plantCrewPreset,
  crewWorks,
  scheduleWindowMatches,
} from "../lib/crew-rotation";
import { shiftConfigSchema } from "../lib/operations-rules";
import { endedShiftWindows } from "../lib/shift-schedule-rules";
test("confirmed 4/7 versus 5/6 crew roster repeats over fourteen calendar days", () => {
  const p = plantCrewPreset();
  const on = (d: string) =>
    p.crews
      .filter((c) => crewWorks(c, d))
      .map((c) => c.name)
      .sort();
  assert.deepEqual(on("2026-11-18"), ["Shift 5", "Shift 6"]);
  assert.deepEqual(on("2026-11-19"), ["Shift 5", "Shift 6"]);
  for (const d of ["2026-11-20", "2026-11-21", "2026-11-22"])
    assert.deepEqual(on(d), ["Shift 4", "Shift 7"]);
  assert.deepEqual(on("2026-11-23"), ["Shift 5", "Shift 6"]);
  assert.deepEqual(on("2026-11-30"), on("2026-11-16"));
  assert.deepEqual(on("2026-11-02"), on("2026-11-16"));
  assert(p.crews.every((c) => c.workingDays.filter(Boolean).length === 7));
});
test("crew requirements skip off days and night belongs to its local start date", () => {
  const config = shiftConfigSchema.parse({
    timezone: "America/Chicago",
    ...plantCrewPreset(),
  });
  const windows = endedShiftWindows(
    config,
    new Date("2026-11-18T00:00:00Z"),
    new Date("2026-11-21T12:00:00Z"),
  );
  const s = { config, crewNames: ["Shift 6"], shiftNames: [], weekdays: [] };
  const eligible = windows.filter((w) => scheduleWindowMatches(s, w));
  assert.deepEqual(
    eligible.map((w) => [w.name, w.date]),
    [
      ["Night", "2026-11-18"],
      ["Night", "2026-11-19"],
    ],
  );
  assert.equal(eligible[0].start.toISOString(), "2026-11-18T23:30:00.000Z");
  assert.equal(eligible[0].end.toISOString(), "2026-11-19T11:30:00.000Z");
  assert(
    windows.some(
      (w) =>
        w.date === "2026-11-20" &&
        w.name === "Night" &&
        !scheduleWindowMatches(s, w),
    ),
  );
  const legacy = { config, crewNames: [], shiftNames: ["Day"], weekdays: [3] };
  assert(
    windows
      .filter((w) => scheduleWindowMatches(legacy, w))
      .every((w) => w.weekday === 3 && w.name === "Day"),
  );
});
