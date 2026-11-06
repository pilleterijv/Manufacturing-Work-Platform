import { test } from "node:test";
import assert from "node:assert/strict";
import { endedShiftWindows } from "../lib/shift-schedule-rules";
import {
  machineEventSchema,
  sqlViewName,
  sqlSequence,
} from "../lib/integration-rules";
const config = {
  timezone: "America/Chicago",
  shifts: [
    { name: "Day", startMinute: 360 },
    { name: "Evening", startMinute: 840 },
    { name: "Night", startMinute: 1320 },
  ],
};
test("missed-work deadlines respect overnight shifts, boundaries and daylight saving", () => {
  const fall = endedShiftWindows(
    config,
    new Date("2026-11-01T03:00:00Z"),
    new Date("2026-11-01T12:00:00Z"),
  );
  assert.equal(fall.length, 1);
  assert.equal(fall[0].name, "Night");
  assert.equal((+fall[0].end - +fall[0].start) / 3600000, 9);
  assert.equal(fall[0].date, "2026-10-31");
  const spring = endedShiftWindows(
    config,
    new Date("2026-03-08T04:00:00Z"),
    new Date("2026-03-08T11:00:00Z"),
  );
  assert.equal((+spring[0].end - +spring[0].start) / 3600000, 7);
  assert.equal(
    endedShiftWindows(
      config,
      new Date("2026-11-01T03:00:00Z"),
      new Date("2026-11-01T11:59:59Z"),
    ).length,
    0,
  );
  assert.equal(
    endedShiftWindows(
      config,
      new Date("2026-11-01T12:00:00Z"),
      new Date("2026-11-01T12:00:00Z"),
    ).length,
    0,
  );
});
test("SQL bridge only interpolates validated identifiers and preserves 64-bit event sequences", () => {
  assert.equal(
    sqlViewName("dbo.FloorworkDowntimeEvents"),
    "[dbo].[FloorworkDowntimeEvents]",
  );
  for (const v of [
    "dbo.view;DELETE FROM x",
    "dbo.[view]",
    "x.y.z",
    "(SELECT 1)",
  ])
    assert.throws(() => sqlViewName(v));
  assert.equal(sqlSequence("9223372036854775807"), "9223372036854775807");
  assert.throws(() => sqlSequence("9223372036854775808"));
  assert.throws(() => sqlSequence("1;drop"));
  assert(
    machineEventSchema.safeParse({
      eventId: "e1",
      machineId: "m1",
      state: "down",
      occurredAt: "2026-11-06T10:00:00-06:00",
    }).success,
  );
  assert(
    !machineEventSchema.safeParse({
      eventId: "e1",
      machineId: "m1",
      state: "unknown",
      occurredAt: "2026-11-06",
    }).success,
  );
});
