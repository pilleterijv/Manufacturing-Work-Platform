"use client";
import { useEffect, useRef, useState } from "react";
import { api, getSectionFilters } from "@/lib/client-api";
import { openWorkflow, roleHome } from "@/lib/floor-navigation";
import type { User } from "@/lib/workspace-types";
import { equipmentLabel } from "@/lib/equipment-label";
import RefreshControl, { useSectionRefresh } from "../refresh-control";
export default function WorkQueue({ user, compact = false }: { user: User; compact?: boolean }) {
  const profile = roleHome(user).profile,
    canTeam =
      ["Admin", "Manager", "DL/TL"].includes(user.role) &&
      (user.grants.includes("dashboard") ||
        user.grants.includes("leadership") ||
        user.grants.includes("analytics"));
  const [scope, setScope] = useState(
      !compact &&
        getSectionFilters().focus !== "personal-open" &&
        canTeam &&
        ["manager", "supervisor"].includes(profile)
        ? "team"
        : "my"
    ),
    [location, setLocation] = useState(""),
    [filter, setFilter] = useState(compact ? "assigned" : "action"),
    [search, setSearch] = useState(""),
    [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  async function load() {
    const n = ++sequence.current;
    const p = new URLSearchParams({ scope });
    const eq = getSectionFilters().equipment;
    if (eq) p.set("equipment", eq);
    if (location) {
      const l = JSON.parse(location);
      for (const k of ["plant", "department", "area"]) p.set(k, l[k]);
    }
    try {
      const r = await api("/api/work-queue?" + p);
      if (n === sequence.current) {
        setData(r);
        setError("");
      }
    } catch (e) {
      if (n === sequence.current) {
        setData(null);
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [scope, location]);
  useSectionRefresh(load, (e) => setError(e.message));
  const labels = new Map<string, string>((data?.equipment || []).map((e: any) => [e.id, equipmentLabel(e)])),
    locations = [
      ...new Map(
        (data?.equipment || []).map((e: any) => [
          JSON.stringify({
            plant: e.plant,
            department: e.department,
            area: e.area,
          }),
          { plant: e.plant, department: e.department, area: e.area },
        ])
      ).entries(),
    ] as [string, any][];
  const rows = (data?.items || [])
    .filter((r: any) =>
      filter === "assigned"
        ? r.status !== "Completed"
        : filter === "all" || filter === "completed"
          ? filter === "all" || r.status === "Completed"
          : filter === "overdue"
            ? ["Missed", "Overdue", "Urgent", "Needs setup"].includes(r.status)
            : filter === "validation"
              ? r.status === "Awaiting validation"
              : filter === "upcoming"
                ? r.status === "Upcoming"
                : !["Completed", "Upcoming"].includes(r.status)
    )
    .filter(
      (r: any) =>
        !search ||
        [r.title, r.assignee, r.type, labels.get(r.equipmentId)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
    );
  return (
    <section className="panel work-queue" aria-label="Shift work queue">
      <div className="section-title">
        <div>
          <h2>
            {compact && scope === "my"
              ? "Assigned to me and my station"
              : scope === "team"
                ? "Department work and exceptions"
                : profile === "maintenance"
                  ? "My maintenance work queue"
                  : "My shift work queue"}
          </h2>
          {compact && (
            <p>
              Open and upcoming work assigned to your account, plus shared checks for your station. Select a
              task to open the right section.
            </p>
          )}
          <p>
            {data?.currentShift} · {data?.timezone} · shift checks for the current shift and previous 24 hours
          </p>
        </div>
        <RefreshControl onRefresh={load} label="Refresh work queue" />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details open={!compact}>
        <summary>Filter work queue</summary>
        <div className="form-grid">
          <label className="field">
            <span>Queue scope</span>
            <select aria-label="Queue scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="my">My work</option>
              {canTeam && <option value="team">Assigned departments / areas</option>}
            </select>
          </label>
          <label className="field">
            <span>Queue area</span>
            <select aria-label="Queue area" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">All assigned locations</option>
              {locations.map(([key, l]) => (
                <option key={key} value={key}>
                  {l.plant} / {l.department} / {l.area}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search loaded work</span>
            <input
              aria-label="Search loaded work"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Task, machine, owner or type"
              maxLength={150}
            />
          </label>
        </div>
        <div className="button-row" aria-label="Queue quick filters">
          {[
            ["assigned", "All open assignments"],
            ["action", "Needs action"],
            ["overdue", "Urgent / overdue / missed"],
            ["validation", "Awaiting validation"],
            ["upcoming", "Upcoming"],
            ["completed", "Completed shift checks"],
            ["all", "All loaded work"],
          ].map(([value, label]) => (
            <button
              type="button"
              className={filter === value ? "primary" : "outline"}
              aria-pressed={filter === value}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      {!data ? (
        <p role="status">
          {error ? "Queue unavailable; retry before relying on task status." : "Loading assigned work…"}
        </p>
      ) : (
        <>
          {!data.hasSchedules && (
            <p className="notice">
              No active shift requirements are configured in this view. This does not mean all checks are
              complete. Scheduled PM/CIL work and open actions are listed separately below.
            </p>
          )}
          {data.truncated && (
            <p className="notice">
              Up to 500 priority items are shown. Narrow the area to review additional work; counts here are
              for loaded items.
            </p>
          )}
          <p>
            {rows.length} matching loaded items · refreshed {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
          {rows.slice(0, compact ? 12 : 500).map((r: any) => (
            <article className="queue-row" key={r.id}>
              <div>
                <span
                  className={
                    "badge " +
                    (["Missed", "Overdue", "Urgent", "Needs setup"].includes(r.status) ? "warn" : "")
                  }
                >
                  {r.status}
                </span>
                <strong>
                  {r.type} · {r.title}
                </strong>
                <p>{labels.get(r.equipmentId)}</p>
                <p>
                  Owner: {r.assignee} ·{" "}
                  {!r.due
                    ? "No specific due time"
                    : r.due.length === 10
                      ? "Due " + r.due
                      : (r.type === "Defect" ? "Reported " : "Shift ends ") +
                        new Date(r.due).toLocaleString(undefined, {
                          timeZone: r.timezone || data.timezone,
                        })}{" "}
                  {r.detail ? " · " + r.detail : ""}
                </p>
              </div>
              <div className="button-row">
                {r.canPerform ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => openWorkflow({ tab: r.tab, filters: r.filters })}
                  >
                    Perform task
                  </button>
                ) : r.status !== "Completed" &&
                  r.status !== "Missed" &&
                  r.status !== "Needs setup" &&
                  !["Operator check", "Leader check", "Process audit", "PM", "CIL"].includes(r.type) ? (
                  <button
                    type="button"
                    className="outline"
                    onClick={() => openWorkflow({ tab: r.tab, filters: r.filters })}
                  >
                    Review item
                  </button>
                ) : (
                  <span className="muted">
                    {r.status === "Missed"
                      ? "Miss retained in shift history"
                      : r.status === "Completed"
                        ? "Completion recorded"
                        : r.status === "Upcoming"
                          ? "Not due yet"
                          : "Review / assigned-person action"}
                  </span>
                )}
                {r.status === "Upcoming" && ["PM", "CIL"].includes(r.type) && (
                  <button
                    type="button"
                    className="outline"
                    onClick={() => openWorkflow({ tab: r.tab, filters: r.filters })}
                  >
                    View task
                  </button>
                )}
                <button
                  type="button"
                  className="outline"
                  onClick={() =>
                    openWorkflow({
                      tab: "Machines",
                      filters: { equipment: r.equipmentId },
                    })
                  }
                >
                  Machine
                </button>
              </div>
            </article>
          ))}
          {!rows.length && (
            <p>
              No matching work in this view. Check the scope, area and filter; this is not a blanket
              shift-completion sign-off.
            </p>
          )}
          {compact && rows.length > 12 && (
            <button
              type="button"
              className="primary"
              onClick={() =>
                openWorkflow({
                  tab: "Work queue",
                  filters: { focus: scope === "my" ? "personal-open" : "department-open" },
                })
              }
            >
              View full work queue ({rows.length} loaded)
            </button>
          )}
          {!!data.handovers?.length && (
            <details className="handover-list">
              <summary>Recent handover notes · last 24 hours ({data.handovers.length})</summary>
              {data.handovers.map((h: any) => (
                <article className="queue-row" key={h.id}>
                  <div>
                    <strong>{labels.get(h.equipmentId)}</strong>
                    <p>
                      {h.shift} ·{" "}
                      {new Date(h.created).toLocaleString(undefined, {
                        timeZone: data.timezone,
                      })}
                    </p>
                    <p>{h.notes || "No shift notes recorded."}</p>
                    {h.rooms
                      .filter((r: any) => r.issues || r.remaining)
                      .map((r: any, i: number) => (
                        <p key={i}>
                          {r.room}: {r.issues} {r.remaining ? `Remaining: ${r.remaining}` : ""}
                        </p>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="outline"
                    onClick={() =>
                      openWorkflow({
                        tab: "DL/TL Standard Work",
                        filters: { equipment: h.equipmentId },
                      })
                    }
                  >
                    Leader-work history
                  </button>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
