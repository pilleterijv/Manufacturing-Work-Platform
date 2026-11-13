import { test } from "node:test";
import assert from "node:assert/strict";
import { roleHome } from "../lib/floor-navigation";
import { defaults } from "../lib/rules";
import { managerAccountPrivileges } from "../lib/delegation-rules";
test("floor home prioritizes the correct work for each role without widening permissions", () => {
  for (const role of ["Operator", "DL/TL", "Manager", "Admin"]) {
    const u = {
      role,
      grants: defaults[role],
      adminPrivileges: role === "Manager" ? managerAccountPrivileges : [],
    };
    const h = roleHome(u);
    assert(h.primary.length > 0);
    assert.equal(
      h.primary[0],
      role === "Operator"
        ? "Standard work"
        : role === "DL/TL"
          ? "DL/TL Standard Work"
          : role === "Manager"
            ? "Leadership dashboard"
            : "Accounts",
    );
  }
  const restricted = roleHome({
    role: "Manager",
    customRole: "Read-only",
    grants: ["dashboard"],
    adminPrivileges: [],
  });
  assert(!restricted.primary.includes("Accounts"));
  assert(!restricted.primary.includes("Problem solving"));
});
