"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Field } from "../shared";
export default function ShiftSchedules() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [managers, setManagers] = useState<string[]>([]),
    [assignees, setAssignees] = useState<string[]>([]),
    [shifts, setShifts] = useState<string[]>([]),
    [weekdays, setWeekdays] = useState<string[]>([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  async function load() {
    try {
      setData(await api("/api/shift-schedules"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/shift-schedules", body);
      await load();
      setNotice(
        "Schedule saved. Channel switches apply to future alerts; disabling email also cancels queued messages.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const picker = (
    label: string,
    items: { id: string; name: string }[],
    selected: string[],
    set: (v: string[]) => void,
  ) => (
    <fieldset className="participant-fieldset field">
      <legend>{label}</legend>
      <div className="participant-picker">
        {items.map((p) => (
          <label className="participant-option" key={p.id}>
            <input
              type="checkbox"
              aria-label={`${label}: ${p.name}`}
              checked={selected.includes(p.id)}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? [...selected, p.id]
                    : selected.filter((id) => id !== p.id),
                )
              }
            />
            {p.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      <section className="idea-intro">
        <span className="eyebrow">SHIFT ACCOUNTABILITY</span>
        <h2>Know what was missed before the next shift.</h2>
        <p>
          Define which standard work is due each shift and who receives the
          exception. Required photo evidence must be present before the app
          accepts a completed verification.
        </p>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {!data ? (
        <p>Loading schedules…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Notification service</h2>
            {data.email.failed > 0 && (
              <button
                className="outline"
                disabled={busy}
                onClick={() => void save({ action: "retryFailedEmails" })}
              >
                Retry failed emails
              </button>
            )}
            <p>
              Shift monitor:{" "}
              {data.health
                ? `last checked ${new Date(data.health.checkedAt).toLocaleString()}`
                : "Awaiting first background check"}
              .
            </p>
            <p>
              Email:{" "}
              {data.email.configured
                ? "SMTP configured"
                : "Not connected — IT must configure SMTP before queued email can be delivered"}
              . {data.email.pending} queued; {data.email.failed} failed.
            </p>
            <p className="small muted">
              The app’s server must stay running. The standard launcher starts
              the background worker; custom hosting must run the worker too.
              Email delivery is retried, with a maximum of ten attempts.
            </p>
          </section>
          <section className="panel">
            <h2>Create shift requirement</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (
                  await save({
                    action: "create",
                    family: f.get("family"),
                    managerIds: managers,
                    assigneeIds: assignees,
                    shiftNames: shifts,
                    weekdays: weekdays.map(Number),
                    notifyInApp: f.get("inApp") === "on",
                    notifyEmail: f.get("email") === "on",
                  })
                ) {
                  form.reset();
                  setManagers([]);
                  setAssignees([]);
                  setShifts([]);
                }
              }}
            >
              <Field label="Scheduled standard">
                <select required name="family" aria-label="Scheduled standard">
                  <option value="">Choose standard work</option>
                  {data.standards.map((s: any) => (
                    <option key={s.family} value={s.family}>
                      {s.kind === "audit" ? "DL/TL" : "Operator"} · {s.title} ·{" "}
                      {s.equipmentName} / {s.department}
                    </option>
                  ))}
                </select>
              </Field>
              {picker(
                "Required shifts",
                data.config.shifts.map((s: any) => ({
                  id: s.name,
                  name: s.name,
                })),
                shifts,
                setShifts,
              )}
              {picker(
                "Weekdays",
                [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((name, i) => ({ id: String(i + 1), name })),
                weekdays,
                setWeekdays,
              )}
              {picker(
                "Notify managers",
                data.people.filter((p: any) =>
                  ["Admin", "Manager", "DL/TL"].includes(p.role),
                ),
                managers,
                setManagers,
              )}
              {picker(
                "Assigned operators (optional)",
                data.people,
                assignees,
                setAssignees,
              )}
              <p className="small muted">
                No assigned operators means one completion for the machine per
                selected shift. When operators are selected, each must complete
                the standard once. Monitoring begins with the first full shift
                after activation. Shift boundaries and timezone are saved with
                the schedule; create a new schedule if the shift definition
                changes.
              </p>
              <div className="button-row">
                <label className="check">
                  <input name="inApp" type="checkbox" defaultChecked />
                  In-app alerts
                </label>
                <label className="check">
                  <input name="email" type="checkbox" defaultChecked />
                  Email alerts
                </label>
              </div>
              <p className="small muted">
                Email recipients need an address in Accounts. Both channels can
                be switched off independently.
              </p>
              <button className="primary" disabled={busy}>
                Create shift requirement
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Scheduled standard work</h2>
            {data.schedules.map((s: any) => (
              <article className="problem-action" key={s.id}>
                <h3>{s.title}</h3>
                <p className="small">
                  {s.shiftNames.join(", ")} · {s.config.timezone} ·{" "}
                  {s.assigneeIds.length
                    ? `${s.assigneeIds.length} assigned operators`
                    : "One completion per machine"}
                </p>
                <p className="small">
                  Recipients:{" "}
                  {s.managerIds
                    .map(
                      (id: string) =>
                        data.people.find((p: any) => p.id === id)?.name ??
                        "Inactive recipient",
                    )
                    .join(", ")}
                </p>
                <div className="button-row">
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Active schedule ${s.id}`}
                      checked={s.active}
                      disabled={busy}
                      onChange={(e) =>
                        void save({
                          action: "update",
                          ...s,
                          active: e.target.checked,
                        })
                      }
                    />
                    Active
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`In-app alerts ${s.id}`}
                      checked={s.notifyInApp}
                      disabled={busy}
                      onChange={(e) =>
                        void save({
                          action: "update",
                          ...s,
                          notifyInApp: e.target.checked,
                        })
                      }
                    />
                    In-app
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Email alerts ${s.id}`}
                      checked={s.notifyEmail}
                      disabled={busy}
                      onChange={(e) =>
                        void save({
                          action: "update",
                          ...s,
                          notifyEmail: e.target.checked,
                        })
                      }
                    />
                    Email
                  </label>
                </div>
              </article>
            ))}
            {!data.schedules.length && (
              <p className="empty">No shift requirements yet.</p>
            )}
            <button className="outline" onClick={() => void load()}>
              Refresh notification status
            </button>
          </section>
        </>
      )}
    </>
  );
}
