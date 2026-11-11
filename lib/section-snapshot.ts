export type SectionSnapshot = {
  metrics: { label: string; value: number; detail: string }[];
  rows: {
    id: string;
    title: string;
    status: string;
    equipment: string;
    person: string;
    date: string;
  }[];
  buckets: { label: string; count: number }[];
  note: string;
};
export function sectionSnapshot(section: string, d: any): SectionSnapshot {
  const source: any[] =
    section === "Problem solving"
      ? d.items || []
      : section === "Defect reporting"
        ? d.defects || []
        : section === "Production results"
          ? d.items || []
          : section === "Improvement ideas"
            ? d.ideas || []
            : section === "Downtime"
              ? d.downtime || []
              : d.records?.length
                ? d.records
                : d.content?.length
                  ? d.content
                  : d.plans || [];
  const rows = source.map((r: any) => ({
    id: r.id,
    title:
      r.title ||
      r.reasonName ||
      r.snapshot?.title ||
      r.data?.snapshot?.title ||
      r.data?.title ||
      r.reference ||
      r.reason ||
      "Recorded work",
    status:
      section === "Downtime"
        ? r.endedAt
          ? "Ended"
          : "Active"
        : r.status ||
          (r.kind === "video"
            ? "Training"
            : r.kind === "guide"
              ? "Guide"
              : r.endedAt
                ? "Stopped"
                : r.startedAt
                  ? "Running"
                  : r.data?.followUp
                    ? "Follow up"
                    : "Recorded"),
    equipment:
      r.snapshot?.area?.area ||
      (d.areas || []).find((a: any) => a.id === r.locationId)?.area ||
      r.equipmentSnapshot?.name ||
      (d.equipment || []).find(
        (e: any) => e.id === (r.equipmentId || r.data?.equipmentId),
      )?.name ||
      "—",
    person:
      r.user?.name ||
      r.starter?.name ||
      r.pilot?.name ||
      (d.people || []).find(
        (p: any) =>
          p.id === (r.userId || r.ownerId || r.reportedBy || r.assigneeId),
      )?.name ||
      "—",
    date:
      r.createdAt ||
      r.created ||
      r.occurredAt ||
      r.startedAt ||
      r.nextDue ||
      "",
  }));
  let metrics = [
    {
      label: "Records shown",
      value: rows.length,
      detail: "Current permitted result page",
    },
    {
      label: "Equipment in scope",
      value: d.equipment?.length || 0,
      detail: "Your permitted machines",
    },
  ];
  if (
    d.overview &&
    [
      "Standard work",
      "Time studies",
      "DL/TL Standard Work",
      "Standard work audits",
      "Analytics",
    ].includes(section)
  ) {
    const key =
      section === "Time studies"
        ? "studies"
        : ["DL/TL Standard Work", "Standard work audits"].includes(section)
          ? "audits"
          : "runs";
    metrics = [
      {
        label:
          section === "Time studies"
            ? "Saved studies"
            : section === "DL/TL Standard Work"
              ? "Completed leader checklists"
              : "Completed runs",
        value:
          section === "DL/TL Standard Work"
            ? d.overview.leaderWork || 0
            : d.overview[key] || 0,
        detail: "All matching records",
      },
      {
        label: "Follow ups",
        value: d.overview.followUps || 0,
        detail: "All matching records",
      },
      {
        label: "Current standards",
        value: d.standards?.length || 0,
        detail: "Latest permitted revisions",
      },
    ];
  }
  if (section === "Time studies") {
    const seconds = (d.records || [])
      .flatMap((r: any) => r.data?.cycles || [])
      .map((c: any) => c.seconds)
      .filter(
        (s: unknown): s is number =>
          typeof s === "number" && Number.isFinite(s),
      );
    metrics = [
      {
        label: "Saved studies",
        value: d.overview?.studies || 0,
        detail: "All matching records",
      },
      {
        label: "Observations shown",
        value: seconds.length,
        detail: "Observations in the loaded studies",
      },
      ...(seconds.length
        ? [
            {
              label: "Mean cycle shown (seconds)",
              value:
                Math.round(
                  (seconds.reduce((a: number, b: number) => a + b, 0) /
                    seconds.length) *
                    100,
                ) / 100,
              detail: "Loaded observations only",
            },
          ]
        : []),
    ];
  }
  if (section === "Training" || section === "Troubleshooting")
    metrics = [
      {
        label:
          section === "Training"
            ? "Training resources"
            : "Troubleshooting guides",
        value: d.content?.length || 0,
        detail: "Matching permitted resources",
      },
      {
        label: "Equipment in scope",
        value: d.equipment?.length || 0,
        detail: "Your permitted machines",
      },
    ];
  if (section === "Analytics")
    metrics = [
      {
        label: "Completed runs",
        value: d.overview?.runs || 0,
        detail: "All matching records",
      },
      {
        label: "Saved studies",
        value: d.overview?.studies || 0,
        detail: "All matching records",
      },
      {
        label: "Standard-work audits",
        value: Math.max(
          0,
          (d.overview?.audits || 0) - (d.overview?.leaderWork || 0),
        ),
        detail: "All matching records",
      },
    ];
  if (d.summary?.openActions !== undefined)
    metrics = [
      {
        label: "Cases",
        value: d.summary.groups.reduce(
          (n: number, g: any) =>
            n + (typeof g._count === "number" ? g._count : g._count?._all || 0),
          0,
        ),
        detail: "All matching investigations",
      },
      {
        label: "Open actions",
        value: d.summary.openActions,
        detail: "All matching cases",
      },
      {
        label: "Overdue actions",
        value: d.summary.overdueActions,
        detail: "All matching cases",
      },
      {
        label: "Overdue cases",
        value: d.summary.overdueCases,
        detail: "All matching cases",
      },
    ];
  if (section === "Preventive maintenance" || section === "TPM / CIL")
    metrics = [
      {
        label: "Plans shown",
        value: d.plans?.length || 0,
        detail: "Current result page",
      },
      {
        label: "Due plans shown",
        value: (d.plans || []).filter(
          (p: any) => p.active && p.nextDue <= d.today,
        ).length,
        detail: "Due today or earlier on this page",
      },
      {
        label: "Recent completions",
        value: d.records?.length || 0,
        detail: "Latest 100 matching completions",
      },
    ];
  if (section === "5S audits")
    metrics = [
      {
        label: "Area audit plans",
        value: d.plans?.length || 0,
        detail: "Matching permitted plans",
      },
      {
        label: "Recent audits",
        value: d.records?.length || 0,
        detail: "Latest 100 matching audits",
      },
      {
        label: "Areas in scope",
        value: d.areas?.length || 0,
        detail: "Assigned permitted areas",
      },
    ];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
  return {
    metrics,
    rows,
    buckets: [...counts].map(([label, count]) => ({ label, count })),
    note: "Status breakdown and record list describe the records loaded here. Use In detail for the working lists and additional pages; exports include the matching history where supported.",
  };
}
