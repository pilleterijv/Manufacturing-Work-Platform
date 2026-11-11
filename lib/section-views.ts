export const sectionEndpoints: Record<string, string> = {
  "Standard work": "/api/platform?view=work",
  "Time studies": "/api/platform?view=studies",
  "DL/TL Standard Work": "/api/platform?view=leaders",
  "Standard work audits": "/api/platform?view=audits",
  Training: "/api/platform?view=training",
  Troubleshooting: "/api/platform?view=guides",
  Analytics: "/api/platform?view=analytics",
  "Preventive maintenance": "/api/maintenance?kind=pm",
  "TPM / CIL": "/api/maintenance?kind=cil",
  "5S audits": "/api/five-s",
  "Defect reporting": "/api/defects",
  "Production results": "/api/external-data?section=Production%20results",
  Downtime: "/api/operations?view=downtime",
  "Improvement ideas": "/api/operations?view=ideas",
  "Problem solving": "/api/problems",
};
export const hasSectionViews = (name: string) =>
  Object.hasOwn(sectionEndpoints, name);

export const hasSectionSearch = (name: string) =>
  hasSectionViews(name) || ["Manage", "Leadership dashboard"].includes(name);
