import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitDowntime,
  shiftConfigSchema,
  ideaSchema,
} from "../lib/operations-rules";
const config = {
  timezone: "America/Chicago",
  shifts: [
    { name: "Shift 1", startMinute: 360 },
    { name: "Shift 2", startMinute: 840 },
    { name: "Shift 3", startMinute: 1320 },
  ],
};
test("downtime is split exactly at shift boundaries", () => {
  const slices = splitDowntime(
    "2026-10-30T18:50:00Z",
    "2026-10-30T19:10:00Z",
    config,
  );
  assert.deepEqual(
    slices.map((s) => [s.shift, s.seconds]),
    [
      ["Shift 1", 600],
      ["Shift 2", 600],
    ],
  );
  assert.equal(
    slices.reduce((a, s) => a + s.seconds, 0),
    1200,
  );
});
test("overnight shift keeps the date on which it began", () => {
  const s = splitDowntime(
    "2026-10-31T04:50:00Z",
    "2026-10-31T05:10:00Z",
    config,
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].shiftDate, "2026-10-30");
  assert.equal(s[0].shift, "Shift 3");
  assert.equal(s[0].seconds, 1200);
});
test("spring-forward and fall-back shifts use actual elapsed hours", () => {
  const spring = splitDowntime(
    "2026-03-08T04:00:00Z",
    "2026-03-08T11:00:00Z",
    config,
  );
  assert.equal(spring.length, 1);
  assert.equal(spring[0].seconds, 7 * 3600);
  const fall = splitDowntime(
    "2026-11-01T03:00:00Z",
    "2026-11-01T12:00:00Z",
    config,
  );
  assert.equal(fall.length, 1);
  assert.equal(fall[0].seconds, 9 * 3600);
});
test("zero-length events have no shift allocation and invalid ranges fail", () => {
  assert.deepEqual(splitDowntime("2026-10-30", "2026-10-30", config), []);
  assert.throws(() => splitDowntime("2026-10-31", "2026-10-30", config));
});
test("shift configuration rejects duplicate starts, duplicate labels and invalid zones", () => {
  assert(shiftConfigSchema.safeParse(config).success);
  assert(
    !shiftConfigSchema.safeParse({ ...config, timezone: "Invalid/Zone" })
      .success,
  );
  assert(
    !shiftConfigSchema.safeParse({
      ...config,
      shifts: [config.shifts[0], config.shifts[0]],
    }).success,
  );
});
test("ideas require real dates, explicit assignments, and deduplicate participants", () => {
  const idea = {
    title: "Improve changeover",
    equipmentId: "machine",
    currentState: "Long setup",
    proposal: "Stage tools",
    dueDate: "2026-11-05",
    pilotId: "pilot",
    validatorId: "validator",
    submitterId: "submitter",
    participantIds: ["pilot", "pilot"],
  };
  assert.deepEqual(ideaSchema.parse(idea).participantIds, ["pilot"]);
  assert(!ideaSchema.safeParse({ ...idea, dueDate: "2026-02-30" }).success);
  assert(!ideaSchema.safeParse({ ...idea, pilotId: "" }).success);
});
