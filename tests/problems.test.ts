import { test } from "node:test";
import assert from "node:assert/strict";
import {
  methods,
  methodology,
  closureErrors,
  actionSchema,
  answersSchema,
} from "../lib/problem-rules";
test("each workbook methodology requires its full discipline evidence before closure", () => {
  for (const m of methods) {
    assert(closureErrors(m, {}, []).length > 1);
    const answers = Object.fromEntries(
      methodology[m].sections.flatMap((s) =>
        s.fields.map(([key]) => [key, "Verified evidence"]),
      ),
    );
    assert.deepEqual(closureErrors(m, answers, [{ status: "Completed" }]), []);
    assert(
      closureErrors(m, answers, [{ status: "Open" }]).includes(
        "Complete all actions and checkpoints",
      ),
    );
    delete answers.effectiveness;
    assert(
      closureErrors(m, answers, [{ status: "Completed" }]).some((e) =>
        e.includes("Effectiveness"),
      ),
    );
  }
});
test("checkpoint actions require a known checkpoint category and real dates", () => {
  const action = {
    type: "Checkpoint",
    title: "Update work instruction",
    ownerId: "8704128e-d69e-49c4-8dc7-4ca871396247",
    dueDate: "2026-11-12",
  };
  assert(!actionSchema.safeParse(action).success);
  assert(actionSchema.safeParse({ ...action, checkpoint: "SOP/JI" }).success);
  assert(
    !actionSchema.safeParse({
      ...action,
      checkpoint: "SOP/JI",
      dueDate: "2026-02-30",
    }).success,
  );
  assert(!answersSchema.safeParse({ unexpected: "value" }).success);
});
