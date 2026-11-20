import { test } from "node:test";
import assert from "node:assert/strict";
import { problemAccess, sameRequirements } from "../lib/problem-access";
const record = {
  createdBy: "creator",
  ownerId: "facilitator",
  reviewerId: "reviewer",
  participantIds: ["participant"],
  actions: [
    { id: "a", ownerId: "action-owner" },
    { id: "b", ownerId: "other" },
  ],
};
test("department managers cannot edit cases just because they manage a department", () => {
  for (const role of ["Manager", "DL/TL", "Operator"]) {
    assert.equal(problemAccess({ id: "outsider", role }, record).editCase, false);
    for (const id of ["creator", "facilitator", "reviewer", "participant", "action-owner"])
      assert.equal(problemAccess({ id, role }, record).editCase, true);
    assert.equal(problemAccess({ id: "participant", role }, record).requirements, false);
  }
  assert.equal(problemAccess({ id: "admin", role: "Admin" }, record).requirements, true);
});
test("action-only contributors can update only their own action, and cannot assign the team", () => {
  const access = problemAccess({ id: "action-owner", role: "Operator" }, record);
  assert.deepEqual(access.updateActionIds, ["a"]);
  assert.equal(access.assignTeam, false);
  assert.equal(problemAccess({ id: "participant", role: "Manager" }, record).assignTeam, false);
});
test("requirement comparisons permit harmless ordering but reject weaker closure policies", () => {
  const r = { fields: ["problem", "cause"], actionTypes: ["Corrective"], requireAction: true };
  assert(sameRequirements(r, { ...r, fields: ["cause", "problem"] }));
  assert(!sameRequirements(r, { ...r, fields: ["problem"] }));
  assert(!sameRequirements(r, { ...r, actionTypes: [] }));
  assert(!sameRequirements(r, { ...r, requireAction: false }));
});
