import type { NavigationUser } from "./navigation";
import { canOpenSection } from "./navigation";
export function roleHome(u: NavigationUser) {
  const role = u.role;
  const title =
    role === "Admin"
      ? "Administration"
      : role === "Manager"
        ? "Department review"
        : role === "DL/TL"
          ? "My shift board"
          : "My shift";
  const primary =
    role === "Admin"
      ? ["Accounts", "Permissions", "Locations", "Manage", "Integrations"]
      : role === "Manager"
        ? [
            "Leadership dashboard",
            "Problem solving",
            "Improvement ideas",
            "Defect reporting",
            "Accounts",
          ]
        : role === "DL/TL"
          ? [
              "DL/TL Standard Work",
              "5S audits",
              "Defect reporting",
              "Problem solving",
              "Notifications",
            ]
          : [
              "Standard work",
              "Downtime",
              "Defect reporting",
              "Troubleshooting",
              "Preventive maintenance",
              "TPM / CIL",
              "5S audits",
            ];
  return { title, primary: primary.filter((name) => canOpenSection(u, name)) };
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
  };
};
export function openWorkflow(target: WorkflowTarget) {
  window.dispatchEvent(
    new CustomEvent("floorwork:navigate", { detail: target }),
  );
}
