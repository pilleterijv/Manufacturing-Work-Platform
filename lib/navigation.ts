import type { Capability } from "./rules";
import type { AdminPrivilege } from "./delegation-rules";
export type NavigationUser = {
  role: string;
  customRole?: string | null;
  grants: Capability[];
  adminPrivileges?: AdminPrivilege[];
};
export const sectionRules: Record<string, Capability | null> = {
  Overview: null,
  "Dashboard settings": null,
  "Standard work": "work",
  "DL/TL Standard Work": "audits",
  "Standard work audits": "audits",
  "Time studies": "studies",
  "Preventive maintenance": "maintenance",
  Centerlines: "centerlines",
  "TPM / CIL": "maintenance",
  "5S audits": "fiveS",
  "Defect reporting": "defects",
  "Production results": "analytics",
  Downtime: "downtime",
  "Improvement ideas": "ideas",
  "Problem solving": "problems",
  Notifications: null,
  "Leadership dashboard": "leadership",
  Training: null,
  Troubleshooting: null,
  Analytics: "analytics",
  "My account": null,
  Assistant: null,
  Manage: "manage",
  Accounts: "users",
  Locations: "manage",
  "Shift requirements": "manage",
  Permissions: "permissions",
  Integrations: null,
};
export function canOpenSection(u: NavigationUser, name: string) {
  if (!(name in sectionRules)) return false;
  const p = u.adminPrivileges ?? [];
  if (name === "Accounts")
    return (
      u.role === "Admin" ||
      (u.role === "Manager" && !u.customRole) ||
      p.some((v) => v.startsWith("accounts."))
    );
  if (name === "Permissions" || name === "Integrations")
    return u.role === "Admin";
  if (name === "Locations")
    return u.role === "Admin" || p.includes("locations.manage");
  if (name === "Manage")
    return (
      u.grants.includes("manage") ||
      p.some((v) =>
        ["equipment.manage", "standards.manage", "resources.manage"].includes(
          v,
        ),
      )
    );
  if (name === "Shift requirements")
    return u.grants.includes("manage") || p.includes("schedules.manage");
  const cap = sectionRules[name];
  return !cap || u.grants.includes(cap);
}
export const allowedSections = (u: NavigationUser) =>
  Object.keys(sectionRules).filter((n) => canOpenSection(u, n));
