"use client";
import { useEffect, useState } from "react";
import { api, getSectionFilters } from "@/lib/client-api";
import { equipmentLabel } from "@/lib/equipment-label";
import { openWorkflow } from "@/lib/floor-navigation";
import type { User } from "@/lib/workspace-types";
import { canOpenSection } from "@/lib/navigation";
import SearchPicker from "../search-picker";
import RefreshControl from "../refresh-control";
type Row = {
  id: string;
  title: string;
  detail: string;
  tab: string;
  standard?: string;
  item?: string;
};
export default function Machines({ user }: { user: User }) {
  const [catalog, setCatalog] = useState<any[]>([]),
    [selected, setSelected] = useState(getSectionFilters().equipment || ""),
    [query, setQuery] = useState(""),
    [view, setView] = useState("Instructions"),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const g = user.grants,
    machine = catalog.find((e) => e.id === selected);
  async function refresh() {
    const d = await api("/api/assets");
    setCatalog(d.equipment);
    if (selected && !d.equipment.some((e: any) => e.id === selected)) {
      setSelected("");
      setRows([]);
      setError("This machine is no longer in your assigned locations.");
    }
    setRevision((r) => r + 1);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const views = [
    "Instructions",
    ...(g.includes("work") || g.includes("audits") ? ["Checks"] : []),
    ...(g.includes("maintenance") ? ["Maintenance"] : []),
    ...(g.includes("defects") ||
    g.includes("problems") ||
    g.includes("downtime")
      ? ["Issues"]
      : []),
    ...(g.includes("centerlines") ? ["Centerlines"] : []),
    ...(g.some((c) =>
      [
        "analytics",
        "work",
        "audits",
        "studies",
        "maintenance",
        "centerlines",
      ].includes(c),
    )
      ? ["History"]
      : []),
  ];
  useEffect(() => {
    setRows([]);
    setError("");
    if (!selected || !machine) return;
    const c = new AbortController();
    setLoading(true);
    const paths: { path: string; type: string; tab: string }[] = [];
    const add = (path: string, type: string, tab: string) =>
      paths.push({
        path:
          path +
          (path.includes("?") ? "&" : "?") +
          "equipment=" +
          encodeURIComponent(selected),
        type,
        tab,
      });
    if (view === "Instructions") {
      add("/api/platform?view=guides", "content", "Troubleshooting");
      add("/api/platform?view=training", "content", "Training");
    }
    if (view === "Checks") {
      if (g.includes("work"))
        add("/api/platform?view=work", "standards", "Standard work");
      if (g.includes("audits"))
        add("/api/platform?view=leaders", "standards", "DL/TL Standard Work");
      if (g.includes("audits"))
        add("/api/platform?view=audits", "standards", "Standard work audits");
    }
    if (
      view === "Maintenance" ||
      (view === "History" && g.includes("maintenance"))
    ) {
      add(
        "/api/maintenance?kind=pm",
        view === "History" ? "records" : "plans",
        "Preventive maintenance",
      );
      add(
        "/api/maintenance?kind=cil",
        view === "History" ? "records" : "plans",
        "TPM / CIL",
      );
    }
    if (view === "Issues") {
      if (g.includes("defects"))
        add("/api/defects?focus=open", "defects", "Defect reporting");
      if (g.includes("problems"))
        add("/api/problems?focus=open", "items", "Problem solving");
      if (g.includes("downtime"))
        add("/api/operations?view=downtime", "downtime", "Downtime");
    }
    if (
      view === "Centerlines" ||
      (view === "History" && g.includes("centerlines"))
    )
      add(
        "/api/centerlines",
        view === "History" ? "records" : "plans",
        "Centerlines",
      );
    if (
      view === "History" &&
      g.some((c) => ["analytics", "work", "audits", "studies"].includes(c))
    )
      add("/api/platform?view=records", "records", "Analytics");
    Promise.all(
      paths.map(async (p) => {
        const d = await api(p.path, undefined, c.signal);
        const list = d[p.type] || [];
        return list.map((r: any): Row => ({
          id: p.tab + ":" + r.id,
          title:
            r.title ||
            r.reference ||
            r.reasonName ||
            r.data?.snapshot?.title ||
            r.data?.title ||
            "Recorded work",
          detail:
            p.type === "records"
              ? `${r.kind} · ${new Date(r.created).toLocaleString()} · ${r.user?.name || ""}`
              : p.type === "standards"
                ? `Revision ${r.revision} · ${p.tab}`
                : p.type === "plans"
                  ? `${p.tab} · ${r.nextDue ? "due " + r.nextDue : r.active ? "Active" : "Retired"}`
                  : p.type === "content"
                    ? p.tab + (r.equipmentId ? "" : " · Shared resource")
                    : r.status || r.endedAt
                      ? `Status: ${r.status || "Ended"}`
                      : "Active",
          tab:
            p.type === "records" && p.tab === "Analytics"
              ? r.kind === "study"
                ? "Time studies"
                : r.kind === "audit"
                  ? r.data?.snapshot?.workflow === "leader"
                    ? "DL/TL Standard Work"
                    : "Standard work audits"
                  : "Standard work"
              : p.tab,
          standard: p.type === "standards" ? r.id : undefined,
          item: ["defects", "items", "plans"].includes(p.type)
            ? r.id
            : undefined,
        }));
      }),
    )
      .then((groups) => {
        if (!c.signal.aborted) setRows(groups.flat());
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [selected, view, revision, catalog]);
  return (
    <section className="panel machine-workspace" aria-label="Machine workspace">
      <div className="section-title">
        <h2>Machine workspace</h2>
        <RefreshControl label="Refresh machine workspace" onRefresh={refresh} />
      </div>
      <SearchPicker
        label="Find a machine"
        value={query}
        selection={selected}
        placeholder="Machine, line, area or asset ID"
        choices={catalog.map((e) => ({
          value: e.id,
          label: equipmentLabel(e),
          kind: "Machine",
        }))}
        onChange={(value) => {
          setQuery(value);
          setSelected("");
        }}
        onSelect={(choice) => {
          setSelected(choice.value);
          setQuery(choice.label);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {machine ? (
        <>
          <h3>{machine.name}</h3>
          <p className="recording-context">{equipmentLabel(machine)}</p>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={() =>
                openWorkflow({
                  tab: "Work queue",
                  filters: { equipment: selected },
                })
              }
            >
              Work queue for this machine
            </button>
            <a
              className="outline"
              href={"?machine=" + encodeURIComponent(selected)}
            >
              Machine label link
            </a>
          </div>
          <div className="button-row" aria-label="Machine sections">
            {views.map((v) => (
              <button
                type="button"
                key={v}
                className={v === view ? "primary" : "outline"}
                aria-pressed={v === view}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <p>
            Current access only. Lists show the first page of each source; open
            the section for full history, evidence and filters.
          </p>
          {loading ? (
            <p role="status">Loading machine records…</p>
          ) : (
            rows.map((r) => (
              <article className="queue-row" key={r.id}>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.detail}</p>
                </div>
                <button
                  type="button"
                  className="outline"
                  onClick={() =>
                    openWorkflow({
                      tab: canOpenSection(user, r.tab) ? r.tab : "Analytics",
                      filters: {
                        equipment: selected,
                        ...(r.standard ? { standard: r.standard } : {}),
                        ...(r.item ? { item: r.item } : {}),
                        ...(!r.standard && !r.item && view === "Instructions"
                          ? { search: r.title }
                          : {}),
                      },
                    })
                  }
                >
                  {r.standard ? "Open checklist" : "Open section"}
                </button>
              </article>
            ))
          )}
          {!loading && !rows.length && !error && (
            <p>
              No permitted {view.toLowerCase()} records for this machine. Choose
              another section or contact your leader if instructions are
              missing.
            </p>
          )}
        </>
      ) : (
        <p>
          Search and select an assigned machine to see its instructions, checks,
          maintenance, issues and history together.
        </p>
      )}
    </section>
  );
}
