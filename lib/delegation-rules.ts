import { z } from "zod";
import { capabilities, type Capability } from "./rules";
import {
  downtimeAccessSchema,
  allowedDowntimeEquipment,
  type LocationEquipment,
} from "./downtime-access-rules";
export const privilegeDefinitions = {
  "accounts.create": "Create department accounts",
  "accounts.edit": "Edit department account details",
  "accounts.disable": "Enable/disable department accounts",
  "accounts.reset": "Reset passwords/send setup emails",
  "accounts.assign": "Assign departments, areas and machines within your scope",
  "locations.manage": "Maintain assigned location catalog",
  "equipment.manage": "Add equipment in assigned locations",
  "standards.manage": "Publish standard-work revisions",
  "resources.manage": "Maintain troubleshooting guides",
  "training.manage": "Maintain training content",
  "centerlines.manage": "Manage machine centerline settings",
  "maintenance.manage": "Manage PM and CIL plans",
  "fiveS.manage": "Manage 5S area audit plans",
  "schedules.manage": "Manage shift-work schedules",
} as const;
export type AdminPrivilege = keyof typeof privilegeDefinitions;
export const privilegeKeys = Object.keys(
  privilegeDefinitions,
) as AdminPrivilege[];
export const managerAccountPrivileges: AdminPrivilege[] = [
  "accounts.create",
  "accounts.edit",
  "accounts.disable",
  "accounts.reset",
  "accounts.assign",
];
export function validPrivileges(raw: unknown): AdminPrivilege[] {
  return Array.isArray(raw)
    ? raw.filter(
        (v): v is AdminPrivilege =>
          typeof v === "string" && privilegeKeys.includes(v as AdminPrivilege),
      )
    : [];
}
export function effectivePrivileges(
  role: string,
  raw: unknown,
): AdminPrivilege[] {
  return [
    ...new Set(
      role === "Admin"
        ? privilegeKeys
        : [
            ...(role === "Manager" ? managerAccountPrivileges : []),
            ...validPrivileges(raw),
          ],
    ),
  ];
}
export const additionalCapabilities = capabilities.filter(
  (c) => !["users", "permissions"].includes(c),
);
export function effectiveGrants(
  role: string,
  raw: unknown,
  extra: unknown,
  privileges: unknown = [],
): Capability[] {
  if (role === "Admin") return [...capabilities];
  return [
    ...new Set([
      ...validPrivileges(privileges).flatMap((p) =>
        p === "centerlines.manage"
          ? ["centerlines" as const]
          : p === "maintenance.manage"
            ? ["maintenance" as const]
            : p === "fiveS.manage"
              ? ["fiveS" as const]
              : p === "training.manage"
                ? ["training" as const]
                : [],
      ),
      ...(Array.isArray(raw)
        ? raw.filter(
            (v): v is Capability =>
              typeof v === "string" && capabilities.includes(v as Capability),
          )
        : []),
      ...(Array.isArray(extra)
        ? extra.filter(
            (v): v is Capability =>
              typeof v === "string" &&
              additionalCapabilities.includes(v as Capability),
          )
        : []),
    ]),
  ];
}
export const delegationSchema = z
  .object({
    extraGrants: z
      .array(z.enum(additionalCapabilities as [Capability, ...Capability[]]))
      .max(capabilities.length),
    adminPrivileges: z
      .array(z.enum(privilegeKeys as [AdminPrivilege, ...AdminPrivilege[]]))
      .max(privilegeKeys.length),
  })
  .strict();
// Coverage checks location wildcards too, so today's machines cannot justify grants over future areas.
export function coversWorkspace(
  actor: { role: string; workspaceAccess: unknown },
  raw: unknown,
  equipment: LocationEquipment[],
) {
  const t = downtimeAccessSchema.safeParse(raw),
    a = downtimeAccessSchema.safeParse(actor.workspaceAccess);
  if (!t.success) return false;
  if (actor.role === "Admin") return true;
  if (!a.success) return false;
  if (a.data.mode === "all") return true;
  if (t.data.mode === "all") return false;
  return (
    t.data.locations.every((l) =>
      a.data.locations.some(
        (x) =>
          x.plant === l.plant &&
          x.department === l.department &&
          (x.area === null || x.area === l.area),
      ),
    ) &&
    t.data.equipmentIds.every((id) => {
      const e = equipment.find((e) => e.id === id);
      return (
        !!e && allowedDowntimeEquipment(actor.role, actor.workspaceAccess, e)
      );
    })
  );
}
export function sharesWorkspace(
  actor: { role: string; workspaceAccess: unknown },
  target: { role: string; workspaceAccess: unknown },
  equipment: LocationEquipment[],
) {
  if (actor.role === "Admin") return true;
  const a = downtimeAccessSchema.safeParse(actor.workspaceAccess),
    t = downtimeAccessSchema.safeParse(target.workspaceAccess);
  if (!a.success || !t.success) return false;
  if (a.data.mode === "all")
    return (
      t.data.mode === "all" ||
      !!(t.data.locations.length || t.data.equipmentIds.length)
    );
  if (t.data.mode === "all")
    return !!(a.data.locations.length || a.data.equipmentIds.length);
  return (
    a.data.locations.some((l) =>
      t.data.locations.some(
        (x) =>
          l.plant === x.plant &&
          l.department === x.department &&
          (l.area === null || x.area === null || l.area === x.area),
      ),
    ) ||
    equipment.some(
      (e) =>
        allowedDowntimeEquipment(actor.role, actor.workspaceAccess, e) &&
        allowedDowntimeEquipment(target.role, target.workspaceAccess, e),
    )
  );
}
export function protectedAccount(target: {
  role: string;
  extraGrants?: unknown;
  adminPrivileges?: unknown;
}) {
  return (
    ["Admin", "Manager"].includes(target.role) ||
    validPrivileges(target.adminPrivileges).length > 0 ||
    (Array.isArray(target.extraGrants) && target.extraGrants.length > 0)
  );
}
