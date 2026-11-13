import { test } from "node:test";
import assert from "node:assert/strict";
import { roleAuthority, roleSchema } from "../lib/role-rules";
import { defaults } from "../lib/rules";
import { managerAccountPrivileges } from "../lib/delegation-rules";
import { canOpenSection } from "../lib/navigation";
const policy = {
  role: "Maintenance Technician",
  baseRole: "Operator",
  grants: ["maintenance", "defects"],
  adminPrivileges: ["maintenance.manage"],
  active: true,
};
test("custom role uses only its own functions and explicit management rights", () => {
  const a = roleAuthority(
    { role: "Operator", customRole: policy.role },
    policy,
  );
  assert(a.grants.includes("maintenance"));
  assert(!a.grants.includes("work"));
  assert(!a.grants.includes("manage"));
  assert.deepEqual(a.privileges, ["maintenance.manage"]);
  assert(
    !canOpenSection(
      {
        role: "Operator",
        customRole: policy.role,
        ...a,
        adminPrivileges: a.privileges,
      },
      "Accounts",
    ),
  );
});
test("custom Manager workflow does not silently inherit account administration", () => {
  const p = {
    ...policy,
    baseRole: "Manager",
    adminPrivileges: [],
    grants: ["dashboard"],
  };
  const a = roleAuthority({ role: "Manager", customRole: p.role }, p);
  assert.deepEqual(a.privileges, []);
  assert(
    !canOpenSection(
      {
        role: "Manager",
        customRole: p.role,
        grants: a.grants,
        adminPrivileges: a.privileges,
      },
      "Accounts",
    ),
  );
  const builtIn = roleAuthority(
    { role: "Manager" },
    { role: "Manager", baseRole: "Manager", grants: defaults.Manager },
  );
  assert(managerAccountPrivileges.every((x) => builtIn.privileges.includes(x)));
});
test("inactive, missing and mismatched custom roles fail closed", () => {
  for (const p of [
    undefined,
    { ...policy, active: false },
    { ...policy, baseRole: "Manager" },
  ]) {
    const a = roleAuthority(
      {
        role: "Operator",
        customRole: policy.role,
        extraGrants: ["work"],
        adminPrivileges: ["equipment.manage"],
      },
      p,
    );
    assert.deepEqual(a, { grants: [], privileges: [] });
  }
});
test("custom role cannot use an Admin workflow or global role/account administration", () => {
  const valid = {
    name: "Maintenance Technician",
    baseRole: "Operator",
    description: "Machine care",
    grants: ["maintenance"],
    adminPrivileges: [],
  };
  assert(roleSchema.safeParse(valid).success);
  assert(!roleSchema.safeParse({ ...valid, baseRole: "Admin" }).success);
  for (const cap of ["users", "permissions"])
    assert(!roleSchema.safeParse({ ...valid, grants: [cap] }).success);
  assert(!roleSchema.safeParse({ ...valid, name: "<script>" }).success);
  const a = roleAuthority({ role: "Admin" }, undefined);
  assert(a.grants.includes("permissions"));
});
test("individual extra permissions are additive only for a valid active role", () => {
  const a = roleAuthority(
    {
      role: "Operator",
      customRole: policy.role,
      extraGrants: ["ideas"],
      adminPrivileges: ["resources.manage"],
    },
    policy,
  );
  assert(a.grants.includes("ideas"));
  assert(a.privileges.includes("resources.manage"));
});
