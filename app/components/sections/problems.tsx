"use client";
import { referenceDepartments } from "@/lib/reference-catalog";
import RefreshControl, { useSectionRefresh } from "../refresh-control";
import PersonSelect from "../person-select";
import EvidenceInput from "../evidence-input";
import { useEffect, useState, useRef } from "react";
import { api, filterUrl } from "@/lib/client-api";
import {
  methods,
  secondCauseFields,
  defaultRequirements,
  actionTypes,
  methodology,
  checkpoints,
  problemStatuses,
  actionStatuses,
  type Method,
  type ProblemInput,
} from "@/lib/problem-rules";
import { Field, Metric } from "../shared";
function answerChoices(key: string): string[] {
  if (key === "facilitatorDepartment") return referenceDepartments;
  if (key === "severity") return ["Low", "High"];
  if (key === "occurrence")
    return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
  if (key === "internalExternal") return ["Internal", "External"];
  if (
    ["standardExists", "standardClear", "trained", "emergencyNeeded"].includes(
      key,
    ) ||
    key.startsWith("prevention")
  )
    return ["Yes", "No", "Not applicable"];
  return [];
}
type Person = { id: string; name: string };
type Equipment = {
  id: string;
  name: string;
  plant: string;
  department: string;
  area: string;
  line: string;
};
type Action = {
  required: boolean;
  media?: import("@/lib/evidence-schema").Evidence[];
  id: string;
  type: string;
  checkpoint: string;
  title: string;
  ownerId: string;
  dueDate: string;
  status: string;
  comment: string;
  version: number;
  completedAt: string | null;
  history: any[];
};
type Problem = ProblemInput & {
  id: string;
  reference: string;
  status: string;
  version: number;
  equipmentSnapshot: Equipment;
  actions: Action[];
  history: any[];
  closedAt: string | null;
};
type Item = Pick<
  Problem,
  | "id"
  | "reference"
  | "method"
  | "title"
  | "status"
  | "dueDate"
  | "equipmentSnapshot"
  | "ownerId"
  | "reviewerId"
  | "version"
>;
type QueueItem = Action & { problem: Item };
type List = {
  items: Item[];
  hasMore: boolean;
  cursor: string | null;
  equipment: Equipment[];
  people: Person[];
  departments: string[];
  today: string;
  summary: {
    groups: { method: string; status: string; _count: number }[];
    openActions: number;
    closedActions: number;
    overdueActions: number;
    overdueCases: number;
  };
};
const empty: ProblemInput = {
  media: [],
  title: "",
  method: "2D",
  equipmentId: "",
  occurredOn: "",
  reportedBy: "",
  ownerId: "",
  reviewerId: "",
  team: "",
  dueDate: "",
  previousId: null,
  answers: {},
};
export default function Problems({
  userId,
  userName,
  canExport,
}: {
  userId: string;
  userName: string;
  canExport: boolean;
}) {
  const [data, setData] = useState<List | null>(null),
    [department, setDepartment] = useState(""),
    [method, setMethod] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [appliedSearch, setAppliedSearch] = useState(""),
    [view, setView] = useState("records"),
    [queue, setQueue] = useState<{
      items: QueueItem[];
      hasMore: boolean;
      cursor: string | null;
    }>({ items: [], hasMore: false, cursor: null }),
    [draft, setDraft] = useState<ProblemInput | null>(null),
    [selected, setSelected] = useState<Problem | null>(null),
    [caseStatus, setCaseStatus] = useState("Open"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [caseUploading, setCaseUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const params = () =>
    new URLSearchParams({ department, method, status, search: appliedSearch });
  async function load(more = false) {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const p = params();
    if (more && data?.cursor) p.set("cursor", data.cursor);
    try {
      const r = await api("/api/problems?" + p);
      if (current !== generation.current) return;
      setData((prev) => ({
        ...r,
        items: more ? [...(prev?.items ?? []), ...r.items] : r.items,
      }));
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  async function loadQueue(more = false) {
    const p = params();
    p.set("view", "queue");
    if (more && queue.cursor) p.set("cursor", queue.cursor);
    try {
      const r = await api("/api/problems?" + p);
      setQueue((prev) => ({
        ...r,
        items: more ? [...prev.items, ...r.items] : r.items,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useSectionRefresh(
    async () => {
      await load();
      if (view === "queue") await loadQueue();
    },
    (e) => setError(e.message),
  );
  useEffect(() => {
    void load();
    setSelected(null);
    setDraft(null);
    return () => {
      generation.current++;
    };
  }, [department, method, status, appliedSearch]);
  useEffect(() => {
    if (view === "queue") void loadQueue();
  }, [view, department, method, status, appliedSearch]);
  async function open(id: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await api("/api/problems?id=" + id);
      setSelected(r);
      setDraft(r);
      setCaseStatus(r.status);
      setView("records");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function post(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api("/api/problems", body);
      await load();
      if (selected) {
        const detail = await api("/api/problems?id=" + selected.id);
        setSelected(detail);
        setDraft(detail);
        setCaseStatus(detail.status);
      }
      if (view === "queue") await loadQueue();
      setNotice("Saved to the database.");
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function create(m: Method, previous: Problem | null = null) {
    setSelected(null);
    setCaseStatus("Open");
    setNotice("");
    setError("");
    setDraft({
      ...empty,
      method: m,
      requirements: { ...defaultRequirements(m), actionTypes: [] },
      occurredOn: data!.today,
      dueDate: data!.today,
      ownerId: userId,
      reviewerId: previous?.reviewerId ?? "",
      reportedBy: userName,
      ...(previous
        ? {
            equipmentId: previous.equipmentId,
            title: previous.title,
            team: previous.team,
            answers: { ...previous.answers },
            previousId: previous.id,
          }
        : {}),
    });
  }
  const person = (id: string) =>
    data?.people.find((p) => p.id === id)?.name ?? id;
  const count = (closed: boolean, m?: string) =>
    data?.summary.groups
      .filter(
        (g) => (g.status === "Closed") === closed && (!m || g.method === m),
      )
      .reduce((n, g) => n + g._count, 0) ?? 0;
  const peopleOptions = (
    <>
      <option value="">Choose a person</option>
      {data?.people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      {selected &&
        [selected.ownerId, selected.reviewerId]
          .filter(
            (id, i, a) =>
              a.indexOf(id) === i && !data?.people.some((p) => p.id === id),
          )
          .map((id) => (
            <option key={id} value={id}>
              Inactive account · {id}
            </option>
          ))}
    </>
  );
  const patch = (values: Partial<ProblemInput>) =>
    setDraft((d) => (d ? { ...d, ...values } : null));
  return (
    <>
      <section className="idea-intro">
        <span className="eyebrow">DEFINE → UNDERSTAND → CORRECT → VERIFY</span>
        <h2>A clear path from problem to prevention.</h2>
        <p>
          Choose the simplest method that fits. Escalate when an issue repeats,
          expands, or cannot be resolved at the current level.
        </p>
      </section>
      <div className="method-grid">
        {methods.map((m) => (
          <section className="panel method-card" key={m}>
            <span className="method-mark">{m}</span>
            <h3>{methodology[m].description}</h3>
            <p className="small muted">{methodology[m].guidance}</p>
            <button
              className="primary"
              disabled={!data || busy}
              onClick={() => create(m)}
            >
              New {m} record
            </button>
          </section>
        ))}
      </div>
      <section className="panel">
        <form
          className="problem-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search);
          }}
        >
          <Field label="Problem department">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All departments</option>
              {data?.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Method filter">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Record status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {problemStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Find a record">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={150}
              placeholder="ID or problem title"
            />
          </Field>
          <button className="outline">Search</button>
        </form>
        <p className="small muted">
          Department filters organize reporting; role permissions and
          department/area assignments control access. Summary counts cover every
          matching record, including pages not loaded.
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
      {loading && <p role="status">Loading problem-solving records…</p>}
      {data && (
        <>
          <div className="metrics">
            <Metric
              label="Open records"
              value={count(false)}
              detail={`${count(false, "2D")} × 2D · ${count(false, "4D")} × 4D · ${count(false, "8D")} × 8D`}
            />
            <Metric
              label="Closed records"
              value={count(true)}
              detail="Reviewer-approved closure"
            />
            <Metric
              label="Open actions"
              value={data.summary.openActions}
              detail={`${data.summary.closedActions} completed actions`}
            />
            <Metric
              label="Overdue follow-ups"
              value={data.summary.overdueActions}
              detail={`${data.summary.overdueCases} overdue records`}
              accent
            />
          </div>
          <div className="button-row">
            <button
              className={view === "records" ? "primary" : "outline"}
              onClick={() => setView("records")}
            >
              Record viewer
            </button>
            <button
              className={view === "queue" ? "primary" : "outline"}
              onClick={() => {
                setView("queue");
                setDraft(null);
                setSelected(null);
              }}
            >
              Action update portal
            </button>
            {canExport && (
              <a
                className="outline"
                href={filterUrl("/api/problems?" + params() + "&format=xlsx")}
              >
                ↓ Export problem solving
              </a>
            )}
            <button
              className="outline"
              disabled={loading}
              onClick={() => {
                void load();
                if (view === "queue") void loadQueue();
              }}
            >
              Refresh records
            </button>
          </div>
          {view === "queue" ? (
            <section className="panel">
              <h2>Open actions & checkpoints</h2>
              <p className="muted">
                Owners and managers update status with a comment. Completed
                items leave this queue and remain in the record history.
              </p>
              {queue.items.map((a) => (
                <article className="problem-action" key={a.id}>
                  <div className="section-title">
                    <h3>
                      {a.title}{" "}
                      <span className="badge">
                        {a.required ? "Required" : "Optional"}
                      </span>
                    </h3>
                    <span
                      className={
                        "badge " + (a.dueDate < data.today ? "warn" : "")
                      }
                    >
                      {a.status}
                    </span>
                  </div>
                  <p className="small">
                    {a.problem.reference} · {a.type}
                    {a.checkpoint ? " / " + a.checkpoint : ""} ·{" "}
                    {person(a.ownerId)} · due {a.dueDate}
                  </p>
                  <ActionUpdate
                    a={a}
                    busy={busy}
                    save={(s, c, media) =>
                      post({
                        action: "updateAction",
                        id: a.problem.id,
                        actionId: a.id,
                        version: a.version,
                        status: s,
                        comment: c,
                        media,
                      })
                    }
                  />
                  <button
                    className="text-button"
                    onClick={() => void open(a.problem.id)}
                  >
                    Open full record
                  </button>
                </article>
              ))}
              {!queue.items.length && (
                <p className="empty">No open actions match these filters.</p>
              )}
              {queue.hasMore && (
                <button
                  className="outline"
                  onClick={() => void loadQueue(true)}
                >
                  Load more actions
                </button>
              )}
            </section>
          ) : (
            <>
              {draft && (
                <section className="panel problem-editor">
                  <div className="section-title">
                    <h2>
                      {selected
                        ? selected.reference
                        : `New ${draft.method} problem-solving record`}
                    </h2>
                    <button
                      className="outline"
                      onClick={() => {
                        setDraft(null);
                        setSelected(null);
                      }}
                    >
                      Close editor
                    </button>
                  </div>
                  {draft.previousId && (
                    <p className="small">
                      Linked escalation · original record is preserved.{" "}
                      <button
                        className="text-button"
                        onClick={() => void open(draft.previousId!)}
                      >
                        View previous record
                      </button>
                    </p>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const r = await post({
                        action: selected ? "update" : "create",
                        ...draft,
                        ...(selected
                          ? {
                              id: selected.id,
                              version: selected.version,
                              status: caseStatus,
                            }
                          : {}),
                      });
                      if (r && !selected) await open(r.id);
                    }}
                  >
                    <div className="form-grid">
                      <Field label="Problem title">
                        <input
                          required
                          value={draft.title}
                          maxLength={150}
                          onChange={(e) => patch({ title: e.target.value })}
                        />
                      </Field>
                      <Field label="Problem equipment">
                        <select
                          required
                          disabled={!!selected}
                          value={draft.equipmentId}
                          onChange={(e) =>
                            patch({ equipmentId: e.target.value })
                          }
                        >
                          <option value="">
                            Choose equipment / department
                          </option>
                          {data.equipment.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {[
                                eq.plant,
                                eq.department,
                                eq.area,
                                eq.line,
                                eq.name,
                              ]
                                .filter(Boolean)
                                .join(" / ")}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Date occurred">
                        <input
                          type="date"
                          required
                          value={draft.occurredOn}
                          onChange={(e) =>
                            patch({ occurredOn: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Reported by">
                        <input
                          required
                          value={draft.reportedBy}
                          maxLength={150}
                          onChange={(e) =>
                            patch({ reportedBy: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Facilitator / owner">
                        <PersonSelect
                          people={data?.people ?? []}
                          aria-label="Facilitator / owner"
                          required
                          value={draft.ownerId}
                          onChange={(e) => patch({ ownerId: e.target.value })}
                        />
                      </Field>
                      <Field label="Reviewer">
                        <PersonSelect
                          people={data?.people ?? []}
                          aria-label="Reviewer"
                          required
                          value={draft.reviewerId}
                          onChange={(e) =>
                            patch({ reviewerId: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Record due date">
                        <input
                          type="date"
                          required
                          value={draft.dueDate}
                          onChange={(e) => patch({ dueDate: e.target.value })}
                        />
                      </Field>
                      <Field label="Add team member from employee directory">
                        <PersonSelect
                          aria-label="Add team member from employee directory"
                          people={data?.people ?? []}
                          value=""
                          onChange={(e) => {
                            const p = data?.people.find(
                              (p) => p.id === e.target.value,
                            );
                            if (p)
                              patch({
                                team: [draft.team, p.name]
                                  .filter(Boolean)
                                  .join(", "),
                              });
                          }}
                        />
                      </Field>
                      <Field label="Team / participants">
                        <textarea
                          value={draft.team}
                          maxLength={2000}
                          onChange={(e) => patch({ team: e.target.value })}
                          placeholder="Names and roles of the people working on this problem"
                        />
                      </Field>
                    </div>
                    <p className="small muted">
                      Save incomplete work as an open record. Choose the
                      required fields and action categories below. Required
                      tracked actions must be completed before closure; optional
                      actions can remain open.
                    </p>
                    <fieldset>
                      <legend>Closure requirements</legend>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={
                            (
                              draft.requirements ??
                              defaultRequirements(draft.method)
                            ).requireAction
                          }
                          onChange={(e) =>
                            patch({
                              requirements: {
                                ...defaultRequirements(draft.method),
                                ...draft.requirements,
                                actionTypes:
                                  draft.requirements?.actionTypes ?? [],
                                requireAction: e.target.checked,
                              },
                            })
                          }
                        />
                        At least one tracked action required
                      </label>
                      <p>Require a completed action in these categories:</p>
                      {actionTypes
                        .filter(
                          (t) => t !== "Checkpoint" || draft.method !== "2D",
                        )
                        .map((t) => (
                          <label className="check" key={t}>
                            <input
                              type="checkbox"
                              checked={
                                draft.requirements?.actionTypes.includes(t) ??
                                false
                              }
                              onChange={(e) =>
                                patch({
                                  requirements: {
                                    ...defaultRequirements(draft.method),
                                    ...draft.requirements,
                                    actionTypes: e.target.checked
                                      ? [
                                          ...(draft.requirements?.actionTypes ??
                                            []),
                                          t,
                                        ]
                                      : (
                                          draft.requirements?.actionTypes ?? []
                                        ).filter((x) => x !== t),
                                  },
                                })
                              }
                            />
                            {t}
                          </label>
                        ))}
                    </fieldset>
                    {draft.method !== "2D" && (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={
                            draft.answers.secondRootCauseEnabled === "Yes"
                          }
                          onChange={(e) =>
                            patch({
                              answers: {
                                ...draft.answers,
                                secondRootCauseEnabled: e.target.checked
                                  ? "Yes"
                                  : "No",
                              },
                              requirements: {
                                ...(draft.requirements ??
                                  defaultRequirements(draft.method)),
                                fields: e.target.checked
                                  ? [
                                      ...(
                                        draft.requirements ??
                                        defaultRequirements(draft.method)
                                      ).fields,
                                      "rootCause2",
                                    ]
                                  : (
                                      draft.requirements ??
                                      defaultRequirements(draft.method)
                                    ).fields.filter(
                                      (k) =>
                                        !secondCauseFields.some(
                                          ([field]) => field === k,
                                        ),
                                    ),
                              },
                            })
                          }
                        />
                        Use a second 5-Why root cause path
                      </label>
                    )}
                    {methodology[draft.method].sections
                      .filter(
                        (section) =>
                          section.title !==
                            "Second root cause path (optional)" ||
                          draft.answers.secondRootCauseEnabled === "Yes",
                      )
                      .map((section) => (
                        <fieldset
                          className="problem-discipline"
                          key={section.title}
                        >
                          <legend>{section.title}</legend>
                          <div className="form-grid">
                            {section.fields.map(([key, label]) => (
                              <Field key={key} label={label}>
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={(
                                      draft.requirements ??
                                      defaultRequirements(draft.method)
                                    ).fields.includes(key)}
                                    onChange={(e) => {
                                      const r = draft.requirements ?? {
                                        ...defaultRequirements(draft.method),
                                        actionTypes: [],
                                      };
                                      patch({
                                        requirements: {
                                          ...r,
                                          fields: e.target.checked
                                            ? [...r.fields, key]
                                            : r.fields.filter((k) => k !== key),
                                        },
                                      });
                                    }}
                                  />
                                  Required for closure
                                </label>
                                {answerChoices(key).length ? (
                                  <select
                                    value={draft.answers[key] ?? ""}
                                    onChange={(e) =>
                                      patch({
                                        answers: {
                                          ...draft.answers,
                                          [key]: e.target.value,
                                        },
                                      })
                                    }
                                  >
                                    <option value="">Choose an answer</option>
                                    {answerChoices(key).map((value) => (
                                      <option key={value}>{value}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <textarea
                                    rows={3}
                                    maxLength={5000}
                                    value={draft.answers[key] ?? ""}
                                    onChange={(e) =>
                                      patch({
                                        answers: {
                                          ...draft.answers,
                                          [key]: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder={label}
                                  />
                                )}
                              </Field>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    <EvidenceInput
                      label="Problem photo or video evidence"
                      onBusy={setCaseUploading}
                      value={draft.media ?? []}
                      onChange={(media) => patch({ media })}
                    />
                    {selected && (
                      <Field label="Problem status">
                        <select
                          value={caseStatus}
                          onChange={(e) => setCaseStatus(e.target.value)}
                        >
                          {problemStatuses.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <button
                      className="primary"
                      disabled={busy || caseUploading}
                    >
                      {busy
                        ? "Saving…"
                        : selected
                          ? "Save record"
                          : "Create record & assign ID"}
                    </button>
                  </form>
                  {selected && (
                    <>
                      <div className="section-title">
                        <h2>Actions & checkpoints</h2>
                        {selected.method !== "8D" && (
                          <button
                            className="outline"
                            onClick={() =>
                              create(
                                selected.method === "2D" ? "4D" : "8D",
                                selected,
                              )
                            }
                          >
                            Escalate to {selected.method === "2D" ? "4D" : "8D"}
                          </button>
                        )}
                      </div>
                      {selected.actions.map((a) => (
                        <article className="problem-action" key={a.id}>
                          <h3>{a.title}</h3>
                          <p className="small">
                            {a.type}
                            {a.checkpoint ? " · " + a.checkpoint : ""} ·{" "}
                            {person(a.ownerId)} · due {a.dueDate} · {a.status}
                            {a.completedAt
                              ? " · completed " +
                                new Date(a.completedAt).toLocaleString()
                              : ""}
                          </p>
                          <details>
                            <summary>
                              Edit action details, assignment and requirement
                            </summary>
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                await post({
                                  action: "editAction",
                                  id: selected.id,
                                  actionId: a.id,
                                  version: a.version,
                                  title: f.get("title"),
                                  type: f.get("type"),
                                  ownerId: f.get("ownerId"),
                                  dueDate: f.get("dueDate"),
                                  checkpoint: f.get("checkpoint") ?? "",
                                  required: f.get("required") === "on",
                                });
                              }}
                            >
                              <Field label="Action description">
                                <input
                                  name="title"
                                  required
                                  maxLength={500}
                                  defaultValue={a.title}
                                />
                              </Field>
                              <Field label="Action type">
                                <select name="type" defaultValue={a.type}>
                                  {actionTypes
                                    .filter(
                                      (t) =>
                                        t !== "Checkpoint" ||
                                        selected.method !== "2D",
                                    )
                                    .map((t) => (
                                      <option key={t}>{t}</option>
                                    ))}
                                </select>
                              </Field>
                              <Field label="Action owner">
                                <PersonSelect
                                  people={data?.people ?? []}
                                  aria-label="Action owner"
                                  name="ownerId"
                                  defaultValue={a.ownerId}
                                  required
                                />
                              </Field>
                              <Field label="Action due date">
                                <input
                                  name="dueDate"
                                  type="date"
                                  defaultValue={a.dueDate}
                                  required
                                />
                              </Field>
                              {selected.method !== "2D" && (
                                <Field label="Checkpoint category">
                                  <select
                                    name="checkpoint"
                                    defaultValue={a.checkpoint}
                                  >
                                    <option value="">Not a checkpoint</option>
                                    {checkpoints.map((t) => (
                                      <option key={t}>{t}</option>
                                    ))}
                                  </select>
                                </Field>
                              )}
                              <label className="check">
                                <input
                                  name="required"
                                  type="checkbox"
                                  defaultChecked={a.required}
                                />
                                Required for closure
                              </label>
                              <button
                                className="outline"
                                disabled={busy || selected.status === "Closed"}
                              >
                                Save action details
                              </button>
                            </form>
                          </details>
                          <ActionUpdate
                            key={a.id + ":" + a.version}
                            a={a}
                            busy={busy || selected.status === "Closed"}
                            save={(s, c) =>
                              post({
                                action: "updateAction",
                                id: selected.id,
                                actionId: a.id,
                                version: a.version,
                                status: s,
                                comment: c,
                              })
                            }
                          />
                          <details>
                            <summary>Action change history</summary>
                            {a.history.map((h, i) => (
                              <p className="small" key={i}>
                                {h.at} · {h.name} · {h.event}
                                {h.status ? " → " + h.status : ""} {h.comment}
                              </p>
                            ))}
                          </details>
                        </article>
                      ))}
                      {!selected.actions.length && (
                        <p className="muted">
                          Add an action with an owner and due date to begin
                          follow-up.
                        </p>
                      )}
                      {selected.status !== "Closed" && (
                        <form
                          className="problem-action"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.currentTarget,
                              f = Object.fromEntries(new FormData(form));
                            if (
                              await post({
                                action: "addAction",
                                required: f.required === "on",
                                ...f,
                                id: selected.id,
                                version: selected.version,
                              })
                            )
                              form.reset();
                          }}
                        >
                          <h3>Add action or checkpoint</h3>
                          <div className="form-grid">
                            <Field label="Action description">
                              <input required name="title" maxLength={500} />
                            </Field>
                            <Field label="Action type">
                              <select name="type">
                                {[
                                  "Containment",
                                  "Correction",
                                  "Corrective",
                                  "Preventive",
                                  ...(selected.method !== "2D"
                                    ? ["Checkpoint"]
                                    : []),
                                ].map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Action owner">
                              <PersonSelect
                                people={data?.people ?? []}
                                aria-label="Action owner"
                                name="ownerId"
                                required
                              />
                            </Field>
                            <Field label="Action due date">
                              <input
                                name="dueDate"
                                type="date"
                                required
                                defaultValue={selected.dueDate}
                              />
                            </Field>
                            {selected.method !== "2D" && (
                              <Field label="Checkpoint category">
                                <select name="checkpoint">
                                  <option value="">Not a checkpoint</option>
                                  {checkpoints.map((c) => (
                                    <option key={c}>{c}</option>
                                  ))}
                                </select>
                              </Field>
                            )}
                          </div>
                          <label className="check">
                            <input
                              type="checkbox"
                              name="required"
                              defaultChecked
                            />
                            Required for closure
                          </label>
                          <button className="primary" disabled={busy}>
                            Add tracked action
                          </button>
                        </form>
                      )}
                      <details className="problem-action">
                        <summary>Record change history</summary>
                        {selected.history.map((h, i) => (
                          <p className="small" key={i}>
                            {h.at} · {h.name} · {h.event} {h.status}
                          </p>
                        ))}
                      </details>
                    </>
                  )}
                </section>
              )}
              <section className="panel table-wrap">
                <h2>Problem-solving records</h2>
                <RefreshControl onRefresh={() => load()} />
                <table>
                  <thead>
                    <tr>
                      <th>Record / method</th>
                      <th>Problem / department</th>
                      <th>Facilitator</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.reference}</strong>
                          <small>{r.method}</small>
                        </td>
                        <td>
                          {r.title}
                          <small>
                            {r.equipmentSnapshot.department} ·{" "}
                            {r.equipmentSnapshot.name}
                          </small>
                        </td>
                        <td>{person(r.ownerId)}</td>
                        <td>{r.dueDate}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (r.status !== "Closed" && r.dueDate < data.today
                                ? "warn"
                                : "")
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() => void open(r.id)}
                          >
                            View / update
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.items.length && (
                  <p className="empty">
                    No problem-solving records yet. Choose 2D, 4D or 8D above to
                    start.
                  </p>
                )}
                {data.hasMore && (
                  <button
                    className="outline"
                    disabled={loading}
                    onClick={() => void load(true)}
                  >
                    Load more records
                  </button>
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
function ActionUpdate({
  a,
  busy,
  save,
}: {
  a: Action;
  busy: boolean;
  save: (
    status: string,
    comment: string,
    media: import("@/lib/evidence-schema").Evidence[],
  ) => Promise<unknown>;
}) {
  const [media, setMedia] = useState(a.media ?? []),
    [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(a.status),
    [comment, setComment] = useState("");
  return (
    <form
      className="problem-action-update"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save(status, comment, media)) setComment("");
      }}
    >
      <Field label="New action status">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {actionStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Update comment / evidence">
        <input
          required
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What changed? What was verified?"
        />
      </Field>
      <EvidenceInput
        label="Action photo or video evidence"
        value={media}
        onChange={setMedia}
        onBusy={setUploading}
      />
      <button className="outline" disabled={busy || uploading}>
        Submit action update
      </button>
    </form>
  );
}
