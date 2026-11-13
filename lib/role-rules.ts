import { z } from "zod";
import { capabilities, roles } from "./rules";
import {
  effectiveGrants,
  effectivePrivileges,
  validPrivileges,
  privilegeKeys,
  type AdminPrivilege,
} from "./delegation-rules";
export const roleNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(
    /^[A-Za-z][A-Za-z0-9 /_-]*$/,
    "Use a clear role name with letters, spaces, numbers, /, - or _",
  );
export const roleSchema = z
  .object({
    name: roleNameSchema,
    baseRole: z.enum(["Operator", "DL/TL", "Manager"]),
    description: z.string().trim().max(500),
    grants: z.array(z.enum(capabilities)).max(capabilities.length),
    adminPrivileges: z
      .array(z.enum(privilegeKeys as [AdminPrivilege, ...AdminPrivilege[]]))
      .max(privilegeKeys.length),
  })
  .refine(
    (v) => !v.grants.some((g) => g === "users" || g === "permissions"),
    "Global account/role administration stays with Admin",
  );
export type RolePolicy = {
  role: string;
  grants: unknown;
  baseRole?: string;
  adminPrivileges?: unknown;
  active?: boolean;
};
export type RoleAccount = {
  role: string;
  customRole?: string | null;
  extraGrants?: unknown;
  adminPrivileges?: unknown;
};
export function roleAuthority(
  user: RoleAccount,
  policy: RolePolicy | undefined,
) {
  if (user.role === "Admin" && !user.customRole)
    return {
      grants: effectiveGrants("Admin", [], []),
      privileges: effectivePrivileges("Admin", []),
    };
  if (
    !policy ||
    policy.active === false ||
    (user.customRole && policy.baseRole !== user.role)
  )
    return { grants: [], privileges: [] };
  const privileges = effectivePrivileges(
    user.role,
    [
      ...validPrivileges(policy.adminPrivileges),
      ...validPrivileges(user.adminPrivileges),
    ],
    !user.customRole,
  );
  return {
    grants: effectiveGrants(
      user.role,
      policy.grants,
      user.extraGrants,
      privileges,
    ),
    privileges,
  };
}
export function builtinRole(name: string) {
  return (roles as readonly string[]).includes(name);
}
export const capabilityLabels: Record<
  string,
  { label: string; detail: string }
> = {
  work: {
    label: "Perform standard work",
    detail: "Complete machine tasks and view permitted work history",
  },
  studies: { label: "Time studies", detail: "Record process timings" },
  audits: {
    label: "Leader work and process audits",
    detail: "Complete assigned DL/TL checklists and process audits",
  },
  analytics: {
    label: "Analyze recorded work",
    detail: "View permitted observations and statistics",
  },
  export: {
    label: "Export reports",
    detail: "Download permitted records to Excel",
  },
  manage: {
    label: "Broad scoped content editing",
    detail:
      "Edit equipment, standards and other managed content. Prefer specific editing privileges below",
  },
  training: {
    label: "Training content",
    detail: "Training upload/content operations",
  },
  downtime: {
    label: "Record downtime",
    detail: "Start/stop timers for permitted machines",
  },
  ideas: {
    label: "Improvement ideas",
    detail: "Submit and work on improvement ideas",
  },
  leadership: {
    label: "Leadership reports",
    detail: "View reports within assigned departments/areas",
  },
  dashboard: {
    label: "Department dashboards",
    detail: "View permitted department metrics",
  },
  problems: {
    label: "Problem solving",
    detail: "Work on 2D, 4D, 8D records and assigned actions",
  },
  maintenance: {
    label: "PM and CIL tasks",
    detail: "Complete assigned maintenance/CIL work",
  },
  fiveS: { label: "5S area audits", detail: "Perform permitted area audits" },
  defects: {
    label: "Report defects",
    detail: "Report and follow up machine abnormalities",
  },
  centerlines: {
    label: "Centerline audits",
    detail: "Record machine settings against approved limits",
  },
  users: {
    label: "Account administration",
    detail: "Global account administration is reserved for Admin",
  },
  permissions: {
    label: "Role administration",
    detail: "Global role administration is reserved for Admin",
  },
};
