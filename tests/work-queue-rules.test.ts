import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduledQueue,
  nearbyShifts,
  queueOrder,
} from "../lib/work-queue-rules";
import { equipmentLabel, focusedEquipmentIds } from "../lib/equipment-label";
import { roleHome } from "../lib/floor-navigation";
const config = {
  timezone: "America/Chicago",
  shifts: [
    { name: "Day", startMinute: 360 },
    { name: "Night", startMinute: 1080 },
  ],
};
const userId = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-11-17T15:00:00Z");
const standard = {
  id: "standard",
  family: "family",
  revision: 1,
  created: new Date("2026-11-01"),
  kind: "run",
  workflow: "process",
  archived: false,
  assigneeIds: [],
};
const schedule = {
  id: "schedule",
  family: "family",
  equipmentId: "machine",
  kind: "run",
  assigneeIds: [userId],
  shiftNames: ["Day", "Night"],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  effectiveFrom: new Date("2026-11-01"),
  config,
  title: "Shift check",
};
const options = {
  schedules: [schedule],
  standards: [standard],
  records: [],
  userId,
  team: false,
  grants: ["work"],
  people: new Map([
    [userId, "Operator"],
    [other, "Other"],
  ]),
  now,
};
test("current and overnight shift windows use configured timezone and DST", () => {
  const w = nearbyShifts(config, now).find(
    (w) => +w.start <= +now && +w.end > +now,
  )!;
  assert.equal(w.name, "Day");
  assert.equal(w.start.toISOString(), "2026-11-17T12:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-11-18T00:00:00.000Z");
  const dst = nearbyShifts(config, new Date("2026-11-01T09:00Z")).find(
    (w) => w.name === "Night" && w.date === "2026-10-31",
  )!;
  assert.equal((+dst.end - +dst.start) / 3600000, 13);
});
test("shift queue differentiates due, completed and missed without erasing a past miss", () => {
  const initial = scheduledQueue(options);
  assert(
    initial.rows.some((r) => r.status === "Due this shift" && r.canPerform),
  );
  assert(initial.rows.some((r) => r.status === "Missed" && !r.canPerform));
  const record = {
    kind: "run",
    userId,
    created: new Date("2026-11-17T14:00Z"),
    standard: { family: "family", revision: 1 },
  };
  const done = scheduledQueue({ ...options, records: [record] });
  assert(!done.rows.some((r) => r.status === "Due this shift"));
  assert(done.rows.some((r) => r.status === "Completed"));
  assert(done.rows.some((r) => r.status === "Missed"));
});
test("personal scope and station requirements use the actual assignee and required revision", () => {
  assert.equal(
    scheduledQueue({
      ...options,
      schedules: [{ ...schedule, assigneeIds: [other] }],
    }).rows.length,
    0,
  );
  const team = scheduledQueue({
    ...options,
    team: true,
    schedules: [{ ...schedule, assigneeIds: [other] }],
  });
  assert(team.rows.length > 0);
  assert(team.rows.every((r) => !r.canPerform));
  const station = scheduledQueue({
    ...options,
    schedules: [{ ...schedule, assigneeIds: [] }],
    records: [
      {
        kind: "run",
        userId: other,
        created: new Date("2026-11-17T13:00Z"),
        standard: { family: "family", revision: 1 },
      },
    ],
  });
  assert(station.rows.some((r) => r.status === "Completed"));
  const revised = {
    ...standard,
    revision: 2,
    id: "revision2",
    created: new Date("2026-11-17T10:00Z"),
  };
  const stale = scheduledQueue({
    ...options,
    standards: [standard, revised],
    records: [
      {
        kind: "run",
        userId,
        created: new Date("2026-11-17T14:00Z"),
        standard: { family: "family", revision: 1 },
      },
    ],
  });
  assert(stale.rows.some((r) => r.status === "Due this shift"));
});
test("schedules activated mid-shift begin at the next full shift; missing grants never open tasks", () => {
  const rows = scheduledQueue({
    ...options,
    schedules: [{ ...schedule, effectiveFrom: new Date("2026-11-17T13:00Z") }],
  }).rows;
  assert.equal(rows.length, 0);
  assert.equal(scheduledQueue({ ...options, grants: [] }).rows.length, 0);
  const review = scheduledQueue({
    ...options,
    grants: ["analytics"],
    team: true,
  });
  assert(review.rows.length > 0);
  assert(review.rows.every((r) => !r.canPerform));
});
test("labels disambiguate lines and IDs; focused asset IDs only narrow existing access", () => {
  const eq = {
    id: userId,
    name: "Press 01",
    plant: "Plant",
    department: "Tableting",
    area: "Compressing",
    line: "Line 1",
  };
  assert.notEqual(
    equipmentLabel(eq),
    equipmentLabel({ ...eq, id: other, line: "Line 2" }),
  );
  assert(equipmentLabel(eq).includes(userId));
  assert.deepEqual(
    focusedEquipmentIds("https://example.test/?equipment=" + other, [userId]),
    [],
  );
  assert.deepEqual(
    focusedEquipmentIds("https://example.test/?equipment=" + userId, [userId]),
    [userId],
  );
});
test("maintenance and supervisor home profiles change presentation without granting permissions", () => {
  const u = {
    role: "Operator",
    customRole: "Technician",
    homeProfile: "maintenance",
    grants: ["maintenance", "defects"] as any[],
    adminPrivileges: [],
  };
  assert.equal(roleHome(u).title, "My maintenance work");
  assert(!roleHome(u).primary.includes("Standard work"));
  assert(!roleHome(u).primary.includes("Accounts"));
  assert.equal(
    roleHome({ ...u, role: "DL/TL", homeProfile: "supervisor" }).title,
    "Area supervision",
  );
});
