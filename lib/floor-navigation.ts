import type { NavigationUser } from "./navigation";
import { canOpenSection } from "./navigation";
export function roleHome(u: NavigationUser) {
  const role = u.role;
  const profile =
    u.homeProfile && u.homeProfile !== "auto"
      ? u.homeProfile
      : role === "Admin"
        ? "admin"
        : role === "Manager"
          ? "manager"
          : role === "DL/TL"
            ? "leader"
            : "operator";
  const title =
    profile === "admin"
      ? "Administration"
      : profile === "maintenance"
        ? "My maintenance work"
        : profile === "supervisor"
          ? "Area supervision"
          : profile === "manager"
            ? "Department review"
            : profile === "leader"
              ? "My shift board"
              : "My shift";
  const primary =
    profile === "admin"
      ? ["DL/TL Standard Work", "Accounts", "Permissions", "Locations", "Manage", "Integrations"]
      : profile === "maintenance"
        ? ["Work queue", "Machines", "Preventive maintenance", "Defect reporting", "TPM / CIL"]
        : profile === "supervisor"
          ? ["Work queue", "DL/TL Standard Work", "Notifications", "Problem solving", "Machines"]
          : profile === "manager"
            ? [
                "Work queue",
                "DL/TL Standard Work",
                "Leadership dashboard",
                "Problem solving",
                "Improvement ideas",
              ]
            : profile === "leader"
              ? ["Work queue", "DL/TL Standard Work", "5S audits", "Defect reporting", "Problem solving"]
              : [
                  "Work queue",
                  "Standard work",
                  "Downtime",
                  "Defect reporting",
                  "Troubleshooting",
                  "Machines",
                ];
  return {
    title,
    profile,
    primary: primary.filter((name) => canOpenSection(u, name)),
  };
}
export type WorkflowTarget = {
  tab: string;
  filters?: {
    focus?: string;
    item?: string;
    plant?: string;
    department?: string;
    equipment?: string;
    person?: string;
    search?: string;
    standard?: string;
  };
};
export function openWorkflow(target: WorkflowTarget) {
  window.dispatchEvent(new CustomEvent("floorwork:navigate", { detail: target }));
}
