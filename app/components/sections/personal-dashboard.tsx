"use client";
import { useSectionRefresh } from "../refresh-control";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import {
  dashboardPreferences,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import { Field } from "../shared";
export default function PersonalDashboard({
  go,
  preferences,
  canGo = () => true,
}: {
  go: (tab: string) => void;
  preferences?: DashboardPreferences;
  canGo?: (name: string) => boolean;
}) {
  const [data, setData] = useState<any>(null),
    [scope, setScope] = useState(
      dashboardPreferences(preferences).defaultScope,
    ),
    [error, setError] = useState("");
  useSectionRefresh(
    async () => {
      setData(await api("/api/personal-dashboard?scope=" + scope));
    },
    (e) => setError(e.message),
  );
  useEffect(() => {
    const c = new AbortController();
    api("/api/personal-dashboard?scope=" + scope, undefined, c.signal)
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          if (scope !== "personal") setScope("personal");
        }
      });
    return () => c.abort();
  }, [scope]);
  const chosen = dashboardPreferences(preferences ?? data?.preferences).widgets;
  const due = (d: string) => (d < data.today ? " · OVERDUE" : ""),
    machine = (id: string) =>
      data.equipment.find((e: any) => e.id === id)?.name ?? id;
  return (
    <section className="panel personal-dashboard">
      <h2>
        {scope === "personal" ? "My assignments" : "My department at a glance"}
      </h2>
      <p>
        Open items assigned to you, your ideas and investigations, and your
        routine checks. Lists show up to 100 items per section; counts include
        all matching items.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.canDepartment && (
        <>
          <Field label="Assigned department dashboard">
            <select
              value={data.department ? JSON.stringify(data.department) : ""}
              onChange={async (e) => {
                try {
                  await api("/api/personal-dashboard", {
                    department: e.target.value
                      ? JSON.parse(e.target.value)
                      : null,
                  });
                  setScope("personal");
                  setData(await api("/api/personal-dashboard?scope=personal"));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <option value="">Disabled · personal dashboard only</option>
              {data.departments.map((d: any) => (
                <option key={JSON.stringify(d)} value={JSON.stringify(d)}>
                  {d.plant} / {d.department}
                </option>
              ))}
            </select>
          </Field>
          <div className="button-row">
            <button
              className="outline"
              aria-pressed={scope === "personal"}
              onClick={() => setScope("personal")}
            >
              Personal assignments
            </button>
            <button
              className="outline"
              disabled={!data.department}
              aria-pressed={scope === "department"}
              onClick={() => setScope("department")}
            >
              Department dashboard
            </button>
          </div>
        </>
      )}
      {!chosen.length && (
        <p>
          No assignment panels selected. Choose panels in Dashboard settings.
        </p>
      )}
      {data && (
        <>
          <div className="metrics assignment-metrics">
            {[
              "Ideas",
              "Problem solvings",
              "PMs / CILs",
              "Open defects",
              "5S plans",
            ]
              .map((s, i) => ({
                s,
                i,
                key: ["ideas", "problems", "maintenance", "defects", "fiveS"][
                  i
                ],
              }))
              .filter((x) => chosen.includes(x.key as any))
              .sort(
                (a, b) =>
                  chosen.indexOf(a.key as any) - chosen.indexOf(b.key as any),
              )
              .map(({ s, i }) => (
                <button
                  type="button"
                  className="metric metric-shortcut"
                  key={s}
                  disabled={
                    !canGo(
                      [
                        "Improvement ideas",
                        "Problem solving",
                        "Preventive maintenance",
                        "Defect reporting",
                        "5S audits",
                      ][i],
                    )
                  }
                  onClick={() =>
                    go(
                      [
                        "Improvement ideas",
                        "Problem solving",
                        "Preventive maintenance",
                        "Defect reporting",
                        "5S audits",
                      ][i],
                    )
                  }
                  aria-label={`View ${s} assignments`}
                >
                  <strong>{data.counts[i]}</strong>
                  <span>{s}</span>
                  <small>Open section →</small>
                </button>
              ))}
          </div>
          {[
            {
              key: "ideas",
              title: "Improvement ideas",
              tab: "Improvement ideas",
              rows: data.ideas.map((i: any) => ({
                id: i.id,
                title: i.title,
                sub: `${machine(i.equipmentId)} · ${i.status} · due ${i.dueDate}${due(i.dueDate)}`,
              })),
            },
            {
              key: "problems",
              title: "Problem solving and actions",
              tab: "Problem solving",
              rows: data.problems.map((p: any) => ({
                id: p.id,
                title: `${p.reference} · ${p.title}`,
                sub: `${machine(p.equipmentId)} · due ${p.dueDate}${due(p.dueDate)}`,
                actions: p.actions,
              })),
            },
            {
              key: "maintenance",
              title: "PM and CIL checks",
              tab: "Preventive maintenance",
              rows: data.maintenance.map((p: any) => ({
                id: p.id,
                title: p.title,
                tab: p.kind === "cil" ? "TPM / CIL" : "Preventive maintenance",
                sub: `${machine(p.equipmentId)} · due ${p.nextDue}${due(p.nextDue)}`,
              })),
            },
            {
              key: "defects",
              title: "Open defects",
              tab: "Defect reporting",
              rows: data.defects.map((d: any) => ({
                id: d.id,
                title: d.title,
                sub: `${machine(d.equipmentId)} · ${d.priority}`,
              })),
            },
            {
              key: "fiveS",
              title: "5S area audits",
              tab: "5S audits",
              rows: data.fiveS.map((p: any) => ({
                id: p.id,
                title: p.title,
                sub:
                  data.areas.find((l: any) => l.id === p.locationId)?.area ??
                  "",
              })),
            },
          ]
            .filter((group) => chosen.includes(group.key as any))
            .sort(
              (a, b) =>
                chosen.indexOf(a.key as any) - chosen.indexOf(b.key as any),
            )
            .map((group) => (
              <details key={group.title} open>
                <summary>
                  {group.title} ({group.rows.length})
                </summary>
                {group.rows.map((r: any) => (
                  <article key={r.id} className="problem-action">
                    <button
                      className="outline"
                      onClick={() => go(r.tab ?? group.tab)}
                    >
                      {r.title}
                    </button>
                    <p>{r.sub}</p>
                    {r.actions?.map((a: any) => (
                      <p key={a.id}>
                        {a.type}: {a.title} · due {a.dueDate}
                        {due(a.dueDate)}
                      </p>
                    ))}
                  </article>
                ))}
                {!group.rows.length && <p>No open items.</p>}
              </details>
            ))}
        </>
      )}
    </section>
  );
}
