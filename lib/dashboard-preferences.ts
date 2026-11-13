import { z } from "zod";
export const dashboardWidgets = [
  "ideas",
  "problems",
  "maintenance",
  "defects",
  "fiveS",
] as const;
export const dashboardWidgetLabels = {
  ideas: "Improvement ideas",
  problems: "Problem solving and actions",
  maintenance: "PMs and CILs",
  defects: "Defect reporting",
  fiveS: "5S audits",
};
export const homeSections = [
  "Overview",
  "Standard work",
  "DL/TL Standard Work",
  "Standard work audits",
  "Time studies",
  "Preventive maintenance",
  "Centerlines",
  "TPM / CIL",
  "5S audits",
  "Defect reporting",
  "Production results",
  "Downtime",
  "Improvement ideas",
  "Problem solving",
  "Notifications",
  "Leadership dashboard",
  "Training",
  "Troubleshooting",
  "Analytics",
  "My account",
  "Assistant",
  "Manage",
  "Accounts",
  "Locations",
  "Shift requirements",
  "Permissions",
  "Integrations",
] as const;
export const dashboardPreferencesSchema = z
  .object({
    home: z.enum(homeSections).default("Overview"),
    widgets: z
      .array(z.enum(dashboardWidgets))
      .max(5)
      .default([...dashboardWidgets]),
    showLaunchpad: z.boolean().default(true),
    showPerformance: z.boolean().default(true),
    showHistory: z.boolean().default(true),
    defaultScope: z.enum(["personal", "department"]).default("personal"),
  })
  .strict()
  .refine(
    (v) => new Set(v.widgets).size === v.widgets.length,
    "Choose unique panels",
  );
export type DashboardPreferences = z.infer<typeof dashboardPreferencesSchema>;
export function dashboardPreferences(raw: unknown): DashboardPreferences {
  const p = dashboardPreferencesSchema.safeParse(raw);
  return p.success ? p.data : dashboardPreferencesSchema.parse({});
}
