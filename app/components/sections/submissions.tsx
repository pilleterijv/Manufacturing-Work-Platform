"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/client-api";
import type { User } from "@/lib/workspace-types";
import { canOpenSection, sectionLabel } from "@/lib/navigation";
import { openWorkflow } from "@/lib/floor-navigation";
import { equipmentLabel } from "@/lib/equipment-label";
import SubmissionDetail from "../submission-detail";
import { useSectionRefresh } from "../refresh-control";
const types: Record<string, string> = {
  all: "All completed work",
  operator: "Operator tasks",
  leader: "DL/TL Standard Work",
  process: "Process verifications",
  changeover: "Changeovers",
  study: "Time studies",
  pm: "PM completions",
  cil: "CIL completions",
  centerline: "Centerline audits",
  fiveS: "5S audits",
};
export default function Submissions({ user }: { user: User }) {
  const [data, setData] = useState<any>(null),
    [scope, setScope] = useState("area"),
    [type, setType] = useState("all"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<any>(null);
  const sequence = useRef(0);
  const detailAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (detail)
      detailAnchor.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
  }, [detail]);
  async function load(more = false) {
    const n = ++sequence.current;
    setBusy(true);
    try {
      const p = new URLSearchParams({ scope, type, search: query });
      if (more && data?.cursor) p.set("cursor", data.cursor);
      const next = await api("/api/submissions?" + p);
      if (n === sequence.current) {
        setData((old: any) => (more ? { ...next, items: [...(old?.items || []), ...next.items] } : next));
        setError("");
      }
    } catch (e) {
      if (n === sequence.current) {
        setError((e as Error).message);
        if (!more) setData(null);
      }
    } finally {
      if (n === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [scope, type, query]);
  useSectionRefresh(
    () => load(),
    (e) => setError(e.message)
  );
  async function view(row: any) {
    setError("");
    try {
      const d = await api("/api/submissions?" + new URLSearchParams({ source: row.source, id: row.id }));
      setDetail(d);
    } catch (e) {
      setDetail(null);
      setError((e as Error).message);
    }
  }
  const reports = [
    ["Problem solving", "2D / 4D / 8D cases and their assigned actions"],
    ["Improvement ideas", "Ideas, pilots, validators and current progress"],
    ["Defect reporting", "Reported defects, evidence and work orders"],
    ["Downtime", "Started/stopped downtime and reasons"],
    ["Production results", "Imported production records"],
    ["Training", "Published training and videos"],
    ["Troubleshooting", "Published visual guides"],
  ] as const;
  return (
    <>
      <section className="panel">
        <h2>Find submitted work</h2>
        {!user.grants.includes("history") && !user.grants.includes("analytics") && (
          <p className="notice">
            To view everyone’s completed checklists in your area, ask Admin to enable the read-only Area
            submission history permission for your role. Your existing module access and own records remain
            available.
          </p>
        )}
        <p>
          Your role and area assignments control which submitted work you can view. Area submission history
          enables viewing colleagues’ completed checklists. This history is read-only; sharing a submission
          does not grant editing rights.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Whose completed work?</span>
            <select
              aria-label="Whose completed work?"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setDetail(null);
              }}
            >
              <option value="area">Everyone in my assigned scope</option>
              <option value="mine">Only my submissions</option>
            </select>
          </label>
          <label className="field">
            <span>Submission type</span>
            <select
              aria-label="Submission type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setDetail(null);
              }}
            >
              {Object.entries(types).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form
          className="button-row"
          data-no-draft
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setDetail(null);
          }}
        >
          <label className="field">
            <span>Find a submission</span>
            <input
              aria-label="Find a submission"
              value={search}
              maxLength={150}
              placeholder="Checklist title, machine, area or recorder"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className="outline" disabled={busy}>
            Search history
          </button>
          <button className="outline" type="button" disabled={busy} onClick={() => void load()}>
            Refresh submissions
          </button>
        </form>
        <p className="small muted">
          Older entries are available with Load older submissions. Records remain available after a checklist
          revision or retirement. Draft uploads are private until attached to submitted work.
        </p>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {detail && (
        <div ref={detailAnchor} style={{ scrollMarginTop: "12rem" }}>
          <SubmissionDetail key={detail.record.id} data={detail} onClose={() => setDetail(null)} />
        </div>
      )}
      <section className="panel">
        <h2>Completed submissions</h2>
        {data?.items?.length === 0 && (
          <p>
            No completed submissions match these filters in your current scope. Reports and resources are
            listed below.
          </p>
        )}
        {!data && busy && <p role="status">Loading submissions…</p>}
        {data?.items?.map((row: any) => (
          <article className="problem-action" key={row.source + row.id}>
            <div className="section-title">
              <h3>{row.title}</h3>
              <span className="badge">{row.status}</span>
            </div>
            <p>
              {types[row.type] || row.type} · {row.author} · {new Date(row.created).toLocaleString()}
            </p>
            <p>
              {row.equipment
                ? equipmentLabel(row.equipment)
                : [row.area?.plant, row.area?.department, row.area?.area, row.area?.line]
                    .filter(Boolean)
                    .join(" / ")}
            </p>
            <button className="outline" onClick={() => void view(row)}>
              View submitted details
            </button>
          </article>
        ))}
        {data?.hasMore && (
          <button className="outline" disabled={busy} onClick={() => void load(true)}>
            Load older submissions
          </button>
        )}
        <p className="small muted">
          {data?.items?.length || 0} entries loaded
          {data?.generatedAt ? ` · refreshed ${new Date(data.generatedAt).toLocaleTimeString()}` : ""}
        </p>
      </section>
      <section className="panel">
        <h2>Reports and published resources</h2>
        <p>
          These sections hold live reports, their actions/status and published resources. The same area and
          module permissions apply. Update controls remain limited to authorized people.
        </p>
        <div className="button-row">
          {reports
            .filter(([name]) => canOpenSection(user, name))
            .map(([name, description]) => (
              <button key={name} className="outline" onClick={() => openWorkflow({ tab: name })}>
                {sectionLabel(name)}
                <small>{description}</small>
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
