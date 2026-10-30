"use client";
import { useEffect, useState, useMemo, memo } from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  durationText,
  splitDowntime,
  ShiftConfig,
  EquipmentSnapshot,
  ideaStatuses,
  localToday,
} from "@/lib/operations-rules";
import {
  type Person,
  type DownEvent,
  type Idea,
  type OperationsData,
  emptyOperations,
} from "@/lib/operations-types";
import type { leadershipReport } from "@/lib/leadership";

type Save = (body: unknown) => Promise<boolean>;
function Field({
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
function Equipment({
  equipment,
  value,
  onChange,
}: {
  equipment: EquipmentSnapshot[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label="Equipment"
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select equipment</option>
      {equipment.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} · {e.department} / {e.line}
        </option>
      ))}
    </select>
  );
}
function useServerClock(serverNow: string) {
  const [anchor, setAnchor] = useState({
      time: +new Date(serverNow),
      local: Date.now(),
    }),
    [now, setNow] = useState(+new Date(serverNow));
  useEffect(() => {
    const time = +new Date(serverNow);
    setAnchor({ time, local: Date.now() });
    setNow(time);
  }, [serverNow]);
  useEffect(() => {
    const id = setInterval(
      () => setNow(anchor.time + Date.now() - anchor.local),
      500,
    );
    return () => clearInterval(id);
  }, [anchor]);
  return now;
}
export function Downtime({
  data,
  equipment,
  admin,
  save,
  busy,
}: {
  data: OperationsData;
  equipment: EquipmentSnapshot[];
  admin: boolean;
  save: Save;
  busy: boolean;
}) {
  const [equipmentId, setEquipment] = useState(""),
    [reason, setReason] = useState(""),
    [department, setDepartment] = useState("");
  const now = useServerClock(data.serverNow);
  const selected = data.downtime.find(
    (d) => d.equipmentId === equipmentId && !d.endedAt,
  );
  const visible = useMemo(
      () =>
        data.downtime.filter(
          (d) => !department || d.equipmentSnapshot.department === department,
        ),
      [data.downtime, department],
    ),
    active = useMemo(() => visible.filter((d) => !d.endedAt), [visible]);
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h2>Track a stoppage</h2>
          <span className="badge">DOWNTIME TRACKING</span>
        </div>
        <p className="muted">
          Choose the machine and reason. Start when it stops; stop when
          production resumes. The timer survives refreshes and sign-outs.
        </p>
        <div className="form-grid">
          <Field label="Equipment">
            <Equipment
              equipment={equipment}
              value={equipmentId}
              onChange={setEquipment}
            />
          </Field>
          <Field label="Downtime reason">
            <select
              aria-label="Downtime reason"
              value={selected?.reasonId ?? reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!!selected}
            >
              <option value="">Select a reason</option>
              {data.reasons
                .filter((r) => r.active || r.id === selected?.reasonId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.active ? "" : " (archived)"}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className={"downtime-clock " + (selected ? "is-down" : "")}>
          <span className="eyebrow">
            {selected ? "DOWNTIME IN PROGRESS" : "READY TO TRACK"}
          </span>
          <strong>
            {selected
              ? durationText((now - +new Date(selected.startedAt)) / 1000)
              : "00:00:00"}
          </strong>
          <p>
            {selected
              ? `${selected.reasonName} · started by ${selected.starter.name}`
              : "One shared timer per machine prevents overlapping records."}
          </p>
          <button
            className={selected ? "danger" : "primary"}
            type="button"
            disabled={busy || !equipmentId || (!selected && !reason)}
            onClick={() =>
              void save(
                selected
                  ? { action: "stop", id: selected.id }
                  : { action: "start", equipmentId, reasonId: reason },
              )
            }
          >
            {busy ? "Saving…" : selected ? "Stop downtime" : "Start downtime"}
          </button>
        </div>
        <p className="small muted">
          Shift reporting uses {data.config.timezone}. Admins can configure the
          shift schedule; existing events retain their original schedule.
        </p>
      </section>
      {active.length > 0 && (
        <section className="panel">
          <h2>Machines currently down</h2>
          <div className="active-downtime">
            {active.map((d) => (
              <button
                key={d.id}
                className="active-down-card"
                onClick={() => setEquipment(d.equipmentId)}
              >
                <span className="badge warn">DOWN</span>
                <strong>{d.equipmentSnapshot.name}</strong>
                <span>{d.reasonName}</span>
                <b>{durationText((now - +new Date(d.startedAt)) / 1000)}</b>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="section-title">
        <h2>Downtime history by shift</h2>
        <select
          aria-label="Downtime department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {[
            ...new Set([
              ...equipment.map((e) => e.department),
              ...data.downtime.map((e) => e.equipmentSnapshot.department),
            ]),
          ]
            .sort()
            .map((d) => (
              <option key={d}>{d}</option>
            ))}
        </select>
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Equipment / department",
                "Reason",
                "Started / ended",
                "Duration",
                "Recorded by",
                "Shift allocation",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <DowntimeHistoryRow
                key={d.id}
                d={d}
                now={d.endedAt ? +new Date(d.endedAt) : now}
              />
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="empty">No downtime events recorded yet.</p>
        )}
      </section>
      <p className="small muted">
        History shows the latest 1,000 events plus all active timers. Full
        records are available in Excel.
      </p>
      {admin && <DowntimeSettings data={data} save={save} busy={busy} />}
    </>
  );
}
function DowntimeSettings({
  data,
  save,
  busy,
}: {
  data: OperationsData;
  save: Save;
  busy: boolean;
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [active, setActive] = useState(true),
    [config, setConfig] = useState<ShiftConfig>(data.config);
  function select(id: string) {
    const reason = data.reasons.find((r) => r.id === id);
    setId(id);
    setName(reason?.name ?? "");
    setActive(reason?.active ?? true);
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <span className="eyebrow">ADMIN ONLY</span>
        <h2>Reasons & timer availability</h2>
        <Field label="Edit downtime reason">
          <select
            aria-label="Edit downtime reason"
            value={id}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">Add a new reason</option>
            {data.reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.active ? "" : " (archived)"}
              </option>
            ))}
          </select>
        </Field>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                action: "reason",
                ...(id ? { id } : {}),
                name,
                active,
              })
            )
              select("");
          }}
        >
          <Field label="Reason name">
            <input
              aria-label="Reason name"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Enable this reason for new timers
          </label>
          <button className="primary" disabled={busy}>
            {id ? "Save reason" : "Add downtime reason"}
          </button>
        </form>
        <p className="small muted">
          Disabling a reason hides it from new timers. Running timers can still
          be stopped, and historical reason names are retained.
        </p>
      </section>
      <section className="panel">
        <span className="eyebrow">ADMIN ONLY</span>
        <h2>Shift schedule</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({ action: "shifts", config });
          }}
        >
          <Field label="IANA time zone">
            <input
              aria-label="IANA time zone"
              required
              value={config.timezone}
              onChange={(e) =>
                setConfig({ ...config, timezone: e.target.value })
              }
              placeholder="America/Chicago"
            />
          </Field>
          {config.shifts.map((s, i) => (
            <div className="shift-editor" key={i}>
              <Field label={`Shift ${i + 1} name`}>
                <input
                  aria-label={`Shift ${i + 1} name`}
                  value={s.name}
                  maxLength={50}
                  required
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      shifts: config.shifts.map((s, j) =>
                        i === j ? { ...s, name: e.target.value } : s,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Shift ${i + 1} start`}>
                <input
                  aria-label={`Shift ${i + 1} start`}
                  type="time"
                  value={`${String(Math.floor(s.startMinute / 60)).padStart(2, "0")}:${String(s.startMinute % 60).padStart(2, "0")}`}
                  required
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    setConfig({
                      ...config,
                      shifts: config.shifts.map((s, j) =>
                        i === j ? { ...s, startMinute: h * 60 + m } : s,
                      ),
                    });
                  }}
                />
              </Field>
              <button
                type="button"
                className="text-button"
                disabled={config.shifts.length === 1}
                aria-label={`Remove shift ${i + 1}`}
                onClick={() =>
                  setConfig({
                    ...config,
                    shifts: config.shifts.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <div className="button-row">
            <button
              type="button"
              className="outline"
              disabled={config.shifts.length >= 8}
              onClick={() =>
                setConfig({
                  ...config,
                  shifts: [
                    ...config.shifts,
                    {
                      name: `Shift ${config.shifts.length + 1}`,
                      startMinute: 0,
                    },
                  ],
                })
              }
            >
              + Add shift
            </button>
            <button className="primary" disabled={busy}>
              Save shift schedule
            </button>
          </div>
        </form>
        <p className="small muted">
          Each shift runs until the next shift starts. The last shift wraps
          overnight. Shift dates identify when that shift started; elapsed time
          accounts for daylight-saving changes.
        </p>
      </section>
    </div>
  );
}
export function ImprovementIdeas({
  data,
  equipment,
  userId,
  admin,
  save,
  busy,
}: {
  data: OperationsData;
  equipment: EquipmentSnapshot[];
  userId: string;
  admin: boolean;
  save: Save;
  busy: boolean;
}) {
  const [equipmentId, setEquipment] = useState(""),
    [participants, setParticipants] = useState<string[]>([]),
    [department, setDepartment] = useState("");
  const today = localToday(data.config.timezone);
  function person(label: string, name: string, defaultValue = "") {
    return (
      <Field label={label}>
        <select
          aria-label={label}
          name={name}
          required
          defaultValue={defaultValue}
        >
          <option value="">Select a person</option>
          {data.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.username})
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <>
      <section className="idea-intro">
        <span className="eyebrow">SMALL IDEAS. MEASURABLE CHANGE.</span>
        <h2>Give a better way a place to start.</h2>
        <p>
          Describe the problem, propose a pilot, and bring the right people
          together.
        </p>
      </section>
      <section className="panel">
        <h2>Submit an improvement idea</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            if (
              await save({
                action: "idea",
                ...values,
                equipmentId,
                participantIds: participants,
              })
            ) {
              form.reset();
              setEquipment("");
              setParticipants([]);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Idea title">
              <input
                aria-label="Idea title"
                name="title"
                maxLength={150}
                required
                placeholder="What could work better?"
              />
            </Field>
            <Field label="Equipment">
              <Equipment
                equipment={equipment}
                value={equipmentId}
                onChange={setEquipment}
              />
            </Field>
            <Field label="Current state">
              <textarea
                aria-label="Current state"
                name="currentState"
                required
                rows={4}
                maxLength={5000}
                placeholder="Describe the current process and problem."
              />
            </Field>
            <Field label="Proposed improvement">
              <textarea
                aria-label="Proposed improvement"
                name="proposal"
                required
                rows={4}
                maxLength={5000}
                placeholder="What would you change and test?"
              />
            </Field>
            {person("Submitted by", "submitterId", userId)}
            {person("Pilot", "pilotId")}
            {person("Validator", "validatorId")}
            <Field label="Due date">
              <input
                aria-label="Due date"
                name="dueDate"
                type="date"
                required
              />
            </Field>
          </div>
          <Field label="Participants">
            <select
              aria-label="Participants"
              multiple
              value={participants}
              onChange={(e) =>
                setParticipants(
                  [...e.target.selectedOptions].map((o) => o.value),
                )
              }
            >
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.username})
                </option>
              ))}
            </select>
          </Field>
          <p className="small muted">
            Select any supporting participants. The assigned pilot receives a
            private in-app message immediately. Your account is recorded as the
            creator, even when you submit on someone else's behalf.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Submit idea & notify pilot"}
          </button>
        </form>
      </section>
      <div className="section-title">
        <h2>Improvement pipeline</h2>
        <select
          aria-label="Ideas department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {[
            ...new Set([
              ...equipment.map((e) => e.department),
              ...data.ideas.map((i) => i.equipmentSnapshot.department),
            ]),
          ]
            .sort()
            .map((d) => (
              <option key={d}>{d}</option>
            ))}
        </select>
      </div>
      <div className="content-grid">
        {data.ideas
          .filter(
            (i) => !department || i.equipmentSnapshot.department === department,
          )
          .map((idea) => (
            <article key={idea.id} className="panel idea-card">
              <div className="section-title">
                <span
                  className={
                    "badge " +
                    (idea.status !== "Completed" && idea.dueDate < today
                      ? "warn"
                      : "")
                  }
                >
                  {idea.status !== "Completed" && idea.dueDate < today
                    ? "Overdue · "
                    : ""}
                  {idea.status}
                </span>
                <small>Due {idea.dueDate}</small>
              </div>
              <h2>{idea.title}</h2>
              <p className="small muted">
                {idea.equipmentSnapshot.department} /{" "}
                {idea.equipmentSnapshot.name}
              </p>
              <h3>Current state</h3>
              <p className="guide-body">{idea.currentState}</p>
              <h3>Proposed improvement</h3>
              <p className="guide-body">{idea.proposal}</p>
              <dl className="idea-people">
                <dt>Submitted by</dt>
                <dd>{idea.submitter.name}</dd>
                <dt>Pilot</dt>
                <dd>{idea.pilot.name}</dd>
                <dt>Validator</dt>
                <dd>{idea.validator.name}</dd>
                <dt>Participants</dt>
                <dd>
                  {idea.participants.map((p) => p.user.name).join(", ") ||
                    "None assigned"}
                </dd>
                <dt>Created by</dt>
                <dd>{idea.creator.name}</dd>
              </dl>
              {(admin ||
                userId === idea.pilot.id ||
                userId === idea.validator.id) && (
                <Field label={`Progress for ${idea.title}`}>
                  <select
                    aria-label={`Progress for ${idea.title}`}
                    disabled={busy}
                    value={idea.status}
                    onChange={(e) =>
                      void save({
                        action: "ideaStatus",
                        id: idea.id,
                        version: idea.version,
                        status: e.target.value,
                      })
                    }
                  >
                    {ideaStatuses
                      .filter(
                        (s) =>
                          s !== "Completed" ||
                          admin ||
                          userId === idea.validator.id ||
                          idea.status === "Completed",
                      )
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </Field>
              )}
            </article>
          ))}
      </div>
      {!data.ideas.length && (
        <section className="panel empty">
          Your first improvement idea starts here.
        </section>
      )}
      <p className="small muted">
        Latest 1,000 ideas shown. Pilots and validators can update progress; the
        validator or Admin signs off completion.
      </p>
    </>
  );
}
export function Notifications({
  data,
  save,
  busy,
  openIdea,
}: {
  data: OperationsData;
  save: Save;
  busy: boolean;
  openIdea: () => void;
}) {
  return (
    <section className="panel">
      <h2>Your messages</h2>
      <p className="muted">
        Pilot assignments appear here. Only the recipient can read or mark their
        messages.
      </p>
      {data.notifications.map((n) => (
        <article
          className={"notification " + (!n.readAt ? "unread" : "")}
          key={n.id}
        >
          <span className="badge">{n.readAt ? "Read" : "New assignment"}</span>
          <p>{n.message}</p>
          <small className="muted">
            {new Date(n.createdAt).toLocaleString()}
          </small>
          <div className="button-row">
            <button className="primary" onClick={openIdea}>
              Open improvement ideas
            </button>
            {!n.readAt && (
              <button
                className="outline"
                disabled={busy}
                onClick={() =>
                  void save({ action: "readNotification", id: n.id })
                }
              >
                Mark as read
              </button>
            )}
          </div>
        </article>
      ))}
      {!data.notifications.length && (
        <p className="empty">
          No messages yet. You'll see pilot assignments here.
        </p>
      )}
    </section>
  );
}
type Report = Awaited<ReturnType<typeof leadershipReport>>;
export function Leadership({
  timezone,
  canExport,
}: {
  timezone: string;
  canExport: boolean;
}) {
  const today = localToday(timezone);
  const [department, setDepartment] = useState(""),
    [from, setFrom] = useState(
      Temporal.PlainDate.from(today).subtract({ days: 29 }).toString(),
    ),
    [to, setTo] = useState(today),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        "/api/leadership?" + new URLSearchParams({ department, from, to }),
      );
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setReport(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const s = report?.summary;
  function metric(
    label: string,
    value: number | string,
    detail: string,
    accent = false,
  ) {
    return (
      <section className={"metric " + (accent ? "accent" : "")}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </section>
    );
  }
  return (
    <>
      <section className="panel">
        <form
          className="leadership-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <Field label="Leadership department">
            <select
              aria-label="Leadership department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All departments</option>
              {report?.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </Field>
          <Field label="To date">
            <input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </Field>
          <button className="primary" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </button>
        </form>
        <p className="small muted">
          Reporting dates use {timezone}. Choose all departments for the overall
          picture, or one department to focus the dashboard.
        </p>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {report && s && (
        <>
          <div className="leadership-heading">
            <div>
              <span className="eyebrow">
                LEADERSHIP / {report.department || "ALL DEPARTMENTS"}
              </span>
              <h2>{report.department || "Whole-floor performance"}</h2>
              <p className="small muted">
                {report.from} through {report.to} · refreshed{" "}
                {new Date(report.generatedAt).toLocaleTimeString()}
              </p>
            </div>
            {canExport && (
              <a
                className="outline"
                href={
                  "/api/leadership?" +
                  new URLSearchParams({
                    department: report.department,
                    from: report.from,
                    to: report.to,
                    format: "xlsx",
                  })
                }
              >
                ↓ Export dashboard
              </a>
            )}
          </div>
          <div className="metrics">
            {metric(
              "Completed standard work",
              s.runs,
              `${s.noAnswers} No answers / ${s.responses} checks`,
            )}
            {metric(
              "Machine downtime",
              `${(s.downtimeSeconds / 60).toFixed(1)} min`,
              `${s.downtimeEvents} events in period`,
              true,
            )}
            {metric(
              "Supervisor audits",
              s.audits,
              `${s.auditFollowUps} require follow-up`,
            )}
            {metric(
              "Open improvement ideas",
              s.openIdeas,
              `${s.overdueIdeas} overdue · current pipeline`,
              s.overdueIdeas > 0,
            )}
          </div>
          <div className="leadership-grid">
            <section className="panel">
              <div className="section-title">
                <h2>Process & people</h2>
                <span className="badge">SECTION OVERVIEW</span>
              </div>
              <div className="summary-list">
                {[
                  ["Equipment", s.equipment],
                  ["Current standards", s.standards],
                  [
                    "Average work completion",
                    s.averageCompletionSeconds === null
                      ? "—"
                      : `${s.averageCompletionSeconds.toFixed(2)}s`,
                  ],
                  ["Time studies", s.studies],
                  ["Raw cycle observations", s.observations],
                  [
                    "Average observation duration",
                    s.cycleStats ? `${s.cycleStats.average.toFixed(2)}s` : "—",
                  ],
                  ["Training videos", s.training],
                  ["Troubleshooting guides", s.guides],
                  ["Ideas submitted in period", s.ideasCreated],
                  ["Completed ideas · all time", s.completedIdeas],
                  ...(s.activePeople === null
                    ? []
                    : [["Active accounts · workspace", s.activePeople]]),
                ].map(([name, value]) => (
                  <div key={String(name)}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="small muted">
                Work, studies, audits, downtime, and new ideas use the selected
                period. Equipment, standards, libraries, and the idea pipeline
                show their current state. Department libraries include shared
                resources.
              </p>
            </section>
            <section className="panel">
              <h2>Downtime by reason</h2>
              {report.reasons.map((r) => (
                <div className="reason-bar" key={r.reason}>
                  <div>
                    <span>{r.reason}</span>
                    <strong>{(r.seconds / 60).toFixed(1)} min</strong>
                  </div>
                  <div className="bar-track">
                    <i
                      style={{
                        width: `${s.downtimeSeconds ? (r.seconds / s.downtimeSeconds) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {!report.reasons.length && (
                <p className="empty">No downtime in this reporting period.</p>
              )}
              <h3 className="pipeline-heading">
                Improvement pipeline · current
              </h3>
              <div className="pipeline-summary">
                {Object.entries(report.ideaStatuses).map(([name, value]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="panel table-wrap">
            <h2>Downtime by shift</h2>
            <table>
              <thead>
                <tr>
                  <th>Shift date</th>
                  <th>Shift</th>
                  <th>Time zone</th>
                  <th>Downtime minutes</th>
                </tr>
              </thead>
              <tbody>
                {report.shifts.map((s) => (
                  <tr key={s.shiftDate + s.shift + s.timezone}>
                    <td>{s.shiftDate}</td>
                    <td>{s.shift}</td>
                    <td>{s.timezone}</td>
                    <td>{(s.seconds / 60).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.shifts.length && (
              <p className="empty">No shift downtime to report.</p>
            )}
          </section>
          <p className="small muted">
            Downtime totals sum machine time; simultaneous stoppages on
            different machines both count. Records crossing the selected dates
            are clipped to that period. Department filters organize reporting;
            workspace roles control access.
          </p>
        </>
      )}
    </>
  );
}

const DowntimeHistoryRow = memo(function DowntimeHistoryRow({
  d,
  now,
}: {
  d: DownEvent;
  now: number;
}) {
  const end = d.endedAt ? +new Date(d.endedAt) : now;
  const slices = splitDowntime(
    d.startedAt,
    new Date(Math.max(+new Date(d.startedAt), end)),
    d.shiftConfig,
  );
  return (
    <tr key={d.id}>
      <td>
        <strong>{d.equipmentSnapshot.name}</strong>
        <small>
          {d.equipmentSnapshot.department} / {d.equipmentSnapshot.line}
        </small>
      </td>
      <td>
        {d.reasonName}
        {!d.endedAt && <small className="badge warn">In progress</small>}
      </td>
      <td>
        {new Date(d.startedAt).toLocaleString()}
        <small>
          {d.endedAt ? new Date(d.endedAt).toLocaleString() : "Still down"}
        </small>
      </td>
      <td>{durationText((end - +new Date(d.startedAt)) / 1000)}</td>
      <td>
        {d.starter.name}
        <small>{d.stopper ? `Stopped: ${d.stopper.name}` : "—"}</small>
      </td>
      <td>
        {slices.map((s, i) => (
          <div className="shift-line" key={i}>
            {s.shiftDate} · {s.shift}
            <strong>{(s.seconds / 60).toFixed(2)} min</strong>
          </div>
        ))}
        <small>{d.shiftConfig.timezone}</small>
      </td>
    </tr>
  );
});
