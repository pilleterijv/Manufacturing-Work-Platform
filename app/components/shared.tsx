"use client";
import { createContext, useContext } from "react";
export const HistoryPagingContext = createContext({
  loadMore: async () => {},
  loading: false,
  hasMore: false,
});
import type { Data, Entry, Step, Cycle } from "@/lib/workspace-types";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Submit({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <button className="primary" disabled={busy} type="submit">
      {busy ? "Saving…" : children}
    </button>
  );
}
export const fmt = (n: number | undefined) =>
  n === undefined ? "—" : n.toFixed(2);
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: number | string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <section className={"metric " + (accent ? "accent" : "")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
export function History({ data, records }: { data: Data; records: Entry[] }) {
  const paging = useContext(HistoryPagingContext);
  return (
    <section className="panel history">
      {!records.length ? (
        <div className="empty">
          <span>◇</span>
          <h3>Your first observation starts here</h3>
          <p>Completed work, time studies, and audits will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Process / study</th>
                <th>Type</th>
                <th>Recorded by</th>
                <th>Date</th>
                <th>Result</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.data.snapshot?.title ?? r.data.title}</strong>
                    <small>
                      {r.data.snapshot
                        ? `Revision ${r.data.snapshot.revision}`
                        : data.equipment.find(
                            (e) => e.id === r.data.equipmentId,
                          )?.name}
                    </small>
                  </td>
                  <td>{r.kind}</td>
                  <td>{r.user.name}</td>
                  <td>{new Date(r.created).toLocaleString()}</td>
                  <td>
                    <span
                      className={"badge " + (r.data.followUp ? "warn" : "")}
                    >
                      {r.data.followUp ? "Follow up" : "Recorded"}
                    </span>
                  </td>
                  <td>
                    <details>
                      <summary>View record</summary>
                      {r.data.operator && <p>Operator: {r.data.operator}</p>}
                      {r.data.snapshot && (
                        <p>
                          Target {r.data.snapshot.target}s · tolerance{" "}
                          {r.data.snapshot.tolerance}%
                        </p>
                      )}
                      {r.data.responses?.map((a: any) => (
                        <div className="record-step" key={a.stepId}>
                          <strong>{a.answer ? "✓ Yes" : "✕ No"}</strong>{" "}
                          {
                            r.data.snapshot.steps.find(
                              (s: Step) => s.id === a.stepId,
                            )?.text
                          }
                          <p>{a.comment}</p>
                          {a.photo && (
                            <a
                              href={`/api/photos/${a.photo}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View evidence photo →
                            </a>
                          )}
                        </div>
                      ))}
                      {r.data.cycles?.map((c: Cycle, i: number) => (
                        <p key={i}>
                          {c.element}: {fmt(c.seconds)}s ·{" "}
                          {new Date(c.at).toLocaleString()}
                        </p>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paging.hasMore && (
        <div className="button-row">
          <button
            type="button"
            className="outline"
            disabled={paging.loading}
            onClick={() => void paging.loadMore()}
          >
            {paging.loading ? "Loading…" : "Load more history"}
          </button>
        </div>
      )}
    </section>
  );
}
export function EquipmentSelect({
  data,
  value,
  onChange,
}: {
  data: Data;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select
      aria-label="Equipment"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
    >
      <option value="">Select equipment</option>
      {data.equipment.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} · {e.line}
        </option>
      ))}
    </select>
  );
}
