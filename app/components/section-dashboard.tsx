"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { sectionEndpoints } from "@/lib/section-views";
import { sectionSnapshot } from "@/lib/section-snapshot";
import { Metric } from "./shared";
import RefreshControl, { useSectionRefresh } from "./refresh-control";
export default function SectionDashboard({
  section,
  openDetails,
  onTitles,
}: {
  section: string;
  openDetails: () => void;
  onTitles?: (titles: string[]) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    const next = await api(sectionEndpoints[section]);
    setData(next);
    onTitles?.(sectionSnapshot(section, next).rows.map((r) => r.title));
  }
  useEffect(() => {
    const c = new AbortController();
    api(sectionEndpoints[section], undefined, c.signal)
      .then((next) => {
        if (!c.signal.aborted) {
          setData(next);
          onTitles?.(sectionSnapshot(section, next).rows.map((r) => r.title));
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [section]);
  useSectionRefresh(load, (e) => setError(e.message));
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <RefreshControl onRefresh={load} label="Retry dashboard" />
      </section>
    );
  if (!data) return <p role="status">Loading section dashboard…</p>;
  const snapshot = sectionSnapshot(section, data),
    max = Math.max(1, ...snapshot.buckets.map((b) => b.count));
  return (
    <section className="section-dashboard" aria-label={`${section} dashboard`}>
      <div className="section-title">
        <h2>{section} at a glance</h2>
        <div className="button-row">
          <RefreshControl onRefresh={load} label="Refresh dashboard" />
          <button className="primary" onClick={openDetails}>
            Open in detail
          </button>
        </div>
      </div>
      <div className="metrics">
        {snapshot.metrics.map((m) => (
          <Metric
            key={m.label}
            label={m.label}
            value={m.value}
            detail={m.detail}
          />
        ))}
      </div>
      <div className="panel">
        <h3>Status breakdown</h3>
        {!snapshot.buckets.length && <p>No matching records yet.</p>}
        {snapshot.buckets.map((b) => (
          <div className="status-bar" key={b.label}>
            <span>{b.label}</span>
            <meter min={0} max={max} value={b.count} aria-label={b.label} />
            <strong>{b.count}</strong>
          </div>
        ))}
        <p className="small muted">{snapshot.note}</p>
      </div>
      <div className="panel">
        <h3>Matching records</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Record / task</th>
                <th>Equipment / area</th>
                <th>Person</th>
                <th>Status</th>
                <th>Date / due</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{r.equipment}</td>
                  <td>{r.person}</td>
                  <td>
                    <span className="badge">{r.status}</span>
                  </td>
                  <td>
                    {r.date
                      ? /^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
                        Number.isNaN(Date.parse(r.date))
                        ? r.date
                        : new Date(r.date).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!snapshot.rows.length && (
          <p>No matching records. Choose In detail to start working.</p>
        )}
      </div>
    </section>
  );
}
