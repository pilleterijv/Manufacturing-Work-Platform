import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  fiveSPlanSchema,
  fiveSPillars,
  validateFiveS,
} from "../lib/floor-rules";
import { allowedArea } from "../lib/area-access";
import { maintenanceSchema } from "../lib/maintenance-rules";
import { maintainxPayload } from "../lib/maintainx";
test("5S covers every pillar, unique questions, bounded scores and required media", () => {
  const questions = fiveSPillars.map((pillar) => ({
      id: randomUUID(),
      pillar,
      text: pillar,
      photo: false,
    })),
    plan = {
      title: "Assembly",
      locationId: randomUUID(),
      questions,
      assigneeIds: [],
      active: true,
    };
  assert(fiveSPlanSchema.safeParse(plan).success);
  assert(
    !fiveSPlanSchema.safeParse({
      ...plan,
      questions: questions.map((q) => ({ ...q, pillar: "Sort" })),
    }).success,
  );
  assert(
    !fiveSPlanSchema.safeParse({
      ...plan,
      questions: [...questions, questions[0]],
    }).success,
  );
  const responses = questions.map((q) => ({
    questionId: q.id,
    score: 3,
    comment: "",
    media: [],
  }));
  assert.deepEqual(validateFiveS(questions, responses), {
    score: 15,
    maximum: 25,
  });
  assert.throws(() => validateFiveS(questions, responses.slice(1)));
  assert.throws(() =>
    validateFiveS(
      [{ ...questions[0], photo: true }, ...questions.slice(1)],
      responses,
    ),
  );
});
test("machine-only access does not grant an entire 5S area", () => {
  const area = { plant: "Plant", department: "Packing", area: "A" },
    user = {
      id: randomUUID(),
      role: "Operator",
      workspaceAccess: {
        mode: "restricted",
        locations: [],
        equipmentIds: [randomUUID()],
      },
    };
  assert.equal(allowedArea(user, area), false);
  assert.equal(
    allowedArea(
      {
        ...user,
        workspaceAccess: {
          mode: "restricted",
          equipmentIds: [],
          locations: [{ ...area }],
        },
      },
      area,
    ),
    true,
  );
  assert.equal(
    allowedArea(
      {
        ...user,
        workspaceAccess: {
          mode: "restricted",
          equipmentIds: [],
          locations: [{ ...area, plant: "Other" }],
        },
      },
      area,
    ),
    false,
  );
});
test("CIL and PM plans retain distinct kinds with the same validation", () => {
  const p = {
    kind: "cil",
    title: "Daily CIL",
    equipmentId: randomUUID(),
    assigneeId: randomUUID(),
    intervalDays: 1,
    nextDue: "2026-11-09",
    steps: [{ id: "clean", text: "Clean", photo: true }],
  };
  assert.equal(maintenanceSchema.parse(p).kind, "cil");
  assert.equal(maintenanceSchema.parse({ ...p, kind: undefined }).kind, "pm");
  assert(!maintenanceSchema.safeParse({ ...p, kind: "other" }).success);
});
test("MaintainX work order includes a stable defect reference without leaking private media URLs", () => {
  const id = randomUUID(),
    payload = maintainxPayload(
      {
        id,
        title: "Leak",
        description: "Seal leak",
        priority: "High",
        equipmentSnapshot: {
          plant: "P",
          department: "D",
          area: "A",
          name: "M",
        },
        media: [{ id: randomUUID(), kind: "photo" }],
      },
      12,
    );
  assert.equal(payload.assetId, 12);
  assert.deepEqual(payload.externalData, { floorworkDefectId: id });
  assert(payload.description.includes("1 photo/video"));
  assert(!payload.description.includes("/api/photos/"));
});
