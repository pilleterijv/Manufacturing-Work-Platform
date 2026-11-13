"use client";
import RefreshControl, { useSectionRefresh } from "../refresh-control";
import PersonSelect from "../person-select";
import { useState, useEffect, useRef } from "react";
import { api, filterUrl } from "@/lib/client-api";
import EvidenceInput, { EvidenceView } from "../evidence-input";
import { Field } from "../shared";
import type { Evidence } from "@/lib/evidence-schema";
export default function Maintenance({
  userId,
  admin,
  kind = "pm",
}: {
  userId: string;
  admin: boolean;
  kind?: "pm" | "cil";
}) {
  const label = kind === "cil" ? "CIL" : "PM";
  const uploads = useRef(0);
  const [showRetired, setShowRetired] = useState(false);
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [responses, setResponses] = useState<
      Record<
        string,
        { answer: boolean | null; comment: string; media: Evidence[] }
      >
    >({}),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const loadSequence = useRef(0);
  async function load(more = false) {
    const sequence = ++loadSequence.current;
    const d = await api(
      "/api/maintenance?kind=" +
        kind +
        (more && data?.cursor ? "&cursor=" + data.cursor : ""),
    );
    if (sequence !== loadSequence.current) return;
    setData((old: any) =>
      more ? { ...d, plans: [...old.plans, ...d.plans] } : d,
    );
  }
  useSectionRefresh(
    () => load(),
    (e) => setError(e.message),
  );
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function save(body: any) {
    setBusy(true);
    setError("");
    try {
      await api("/api/maintenance", { ...body, kind });
      setSelected(null);
      setDraft(null);
      setNotice(`${label} saved.`);
      try {
        await load();
      } catch {
        setNotice(`${label} saved. Refresh the list before another entry.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const location = (id: string) => {
    const e = data?.equipment.find((e: any) => e.id === id);
    return e ? [e.plant, e.department, e.area, e.name].join(" / ") : id;
  };
  return (
    <>
      <section className="panel">
        <h2>
          {kind === "cil"
            ? "TPM · Clean, Inspect and Lubricate"
            : "Machine preventive maintenance"}
        </h2>
        <p>
          Assigned {label} tasks, due dates and permanent completion evidence.
        </p>
        <a
          className="outline"
          href={filterUrl("/api/maintenance?format=xlsx&kind=" + kind)}
        >
          Export {label} plans and history
        </a>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {data?.canManage && (
          <button
            className="primary"
            onClick={() => {
              setSelected(null);
              setDraft({
                title: "",
                equipmentId: "",
                assigneeId: "",
                nextDue: data.today,
                intervalDays: kind === "cil" ? 1 : 30,
                active: true,
                steps: (kind === "cil"
                  ? [
                      "Clean the specified machine points",
                      "Inspect for abnormalities",
                      "Lubricate specified points per machine instructions",
                    ]
                  : [""]
                ).map((text) => ({
                  id: crypto.randomUUID(),
                  text,
                  photo: false,
                })),
              });
            }}
          >
            Create {label} plan
          </button>
        )}
      </section>
      {draft && (
        <section className="panel">
          <h2>{draft.id ? `Edit ${label} plan` : `New ${label} plan`}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ action: "save", ...draft });
            }}
          >
            <div className="form-grid">
              <Field label={`${label} title`}>
                <input
                  required
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label={`${label} machine`}>
                <select
                  required
                  value={draft.equipmentId}
                  onChange={(e) =>
                    setDraft({ ...draft, equipmentId: e.target.value })
                  }
                >
                  <option value="">Choose equipment</option>
                  {data.equipment.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {location(e.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`${label} assignee`}>
                <PersonSelect
                  aria-label={`${label} assignee`}
                  people={data.people}
                  required
                  value={draft.assigneeId}
                  onChange={(e) =>
                    setDraft({ ...draft, assigneeId: e.target.value })
                  }
                />
              </Field>
              <Field label={`Next ${label} due`}>
                <input
                  required
                  type="date"
                  value={draft.nextDue}
                  onChange={(e) =>
                    setDraft({ ...draft, nextDue: e.target.value })
                  }
                />
              </Field>
              <Field label="Repeat every (days)">
                <input
                  required
                  type="number"
                  min={1}
                  max={3660}
                  value={draft.intervalDays}
                  onChange={(e) =>
                    setDraft({ ...draft, intervalDays: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Plan active
            </label>
            {draft.steps.map((s: any, i: number) => (
              <div key={s.id} className="editor-step">
                <Field label={`${label} step ${i + 1}`}>
                  <input
                    required
                    maxLength={500}
                    value={s.text}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        steps: draft.steps.map((x: any, j: number) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.photo}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        steps: draft.steps.map((x: any, j: number) =>
                          j === i ? { ...x, photo: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  Photo or video required
                </label>
                <button
                  className="outline"
                  type="button"
                  disabled={draft.steps.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.filter((_: any, j: number) => j !== i),
                    })
                  }
                >
                  Remove step
                </button>
              </div>
            ))}
            <div className="button-row">
              <button
                className="outline"
                type="button"
                disabled={draft.steps.length >= 100}
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      { id: crypto.randomUUID(), text: "", photo: false },
                    ],
                  })
                }
              >
                Add {label} step
              </button>
              <button className="primary" disabled={busy}>
                Save {label} plan
              </button>
              <button
                className="outline"
                type="button"
                onClick={() => setDraft(null)}
              >
                Cancel {label} edit
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>{label} task list</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          Show retired / inactive tasks
        </label>
        {data?.plans
          .filter((p: any) => p.active || showRetired)
          .map((p: any) => (
            <article className="problem-action" key={p.id}>
              {data.canManage && p.active && (
                <button
                  type="button"
                  className="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Retire this task? Its completed history and evidence will remain available.",
                      )
                    )
                      void save({
                        action: "retire",
                        id: p.id,
                        version: p.version,
                      });
                  }}
                >
                  Delete / retire task
                </button>
              )}
              <h3>
                {p.title}{" "}
                <span
                  className={
                    "badge " +
                    (p.active && p.nextDue < data.today ? "warn" : "")
                  }
                >
                  {!p.active
                    ? "Paused"
                    : p.nextDue < data.today
                      ? "Overdue"
                      : "Scheduled"}
                </span>
              </h3>
              <p>
                {location(p.equipmentId)} ·{" "}
                {data.people.find((x: any) => x.id === p.assigneeId)?.name ??
                  p.assigneeId}{" "}
                · due {p.nextDue} · every {p.intervalDays} days
              </p>
              <div className="button-row">
                {p.active &&
                  p.nextDue <= data.today &&
                  (admin || p.assigneeId === userId) && (
                    <button
                      className="primary"
                      onClick={() => {
                        setDraft(null);
                        setSelected(p);
                        setResponses({});
                      }}
                    >
                      Perform {label}
                    </button>
                  )}
                {data.canManage && (
                  <button
                    className="outline"
                    onClick={() => {
                      setSelected(null);
                      setDraft(p);
                    }}
                  >
                    Edit {label}
                  </button>
                )}
              </div>
            </article>
          ))}
        {data && !data.plans.length && (
          <p>No {label} plans match these filters.</p>
        )}
        {data?.hasMore && (
          <button
            className="outline"
            onClick={() => load(true).catch((e) => setError(e.message))}
          >
            Load more {label} plans
          </button>
        )}
      </section>
      {selected && (
        <section className="panel">
          <h2>
            Perform {label} · {selected.title}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                selected.steps.some(
                  (s: any) =>
                    !responses[s.id] ||
                    responses[s.id].answer == null ||
                    (s.photo && !responses[s.id].media.length),
                )
              ) {
                setError(
                  `Answer every ${label} step and attach required photo/video evidence`,
                );
                return;
              }
              void save({
                action: "complete",
                id: selected.id,
                version: selected.version,
                responses: selected.steps.map((s: any) => ({
                  stepId: s.id,
                  ...responses[s.id],
                })),
              });
            }}
          >
            {selected.steps.map((s: any, i: number) => (
              <section className="step" key={s.id}>
                <h3>
                  {i + 1}. {s.text}
                </h3>
                <div className="yes-no">
                  {[true, false].map((answer) => (
                    <button
                      className="outline"
                      type="button"
                      key={String(answer)}
                      aria-pressed={responses[s.id]?.answer === answer}
                      onClick={() =>
                        setResponses((r) => ({
                          ...r,
                          [s.id]: {
                            ...(r[s.id] ?? { comment: "", media: [] }),
                            answer,
                          },
                        }))
                      }
                    >
                      {answer ? "Yes · complete" : "No · follow up"}
                    </button>
                  ))}
                </div>
                <Field label={`${label} comment ${i + 1}`}>
                  <textarea
                    maxLength={1000}
                    value={responses[s.id]?.comment ?? ""}
                    onChange={(e) =>
                      setResponses((r) => ({
                        ...r,
                        [s.id]: {
                          ...(r[s.id] ?? { answer: null, media: [] }),
                          comment: e.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <EvidenceInput
                  label={
                    s.photo
                      ? `${label} photo or video · required`
                      : `${label} photo or video · optional`
                  }
                  value={responses[s.id]?.media ?? []}
                  onBusy={(b) => {
                    uploads.current = Math.max(
                      0,
                      uploads.current + (b ? 1 : -1),
                    );
                    setUploading(uploads.current > 0);
                  }}
                  onChange={(media) =>
                    setResponses((r) => ({
                      ...r,
                      [s.id]: {
                        ...(r[s.id] ?? { answer: null, comment: "" }),
                        media,
                      },
                    }))
                  }
                />
              </section>
            ))}
            <button className="primary" disabled={busy || uploading}>
              Complete {label} and save evidence
            </button>
            <button
              className="outline"
              type="button"
              onClick={() => setSelected(null)}
            >
              Cancel {label}
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>{label} completion history</h2>
        <RefreshControl onRefresh={() => load()} />
        <p className="small muted">
          Latest 100 matching completions. Export contains the full matching
          history.
        </p>
        {data?.records.map((r: any) => (
          <details key={r.id}>
            <summary>
              {r.data.title} · {r.user.name} ·{" "}
              {new Date(r.created).toLocaleString()}
            </summary>
            <p>
              Scheduled due {r.data.scheduledDue} ·{" "}
              {location(r.data.equipmentId)} ·{" "}
              {r.data.followUp ? "Follow up required" : "Completed"}
            </p>
            {r.data.responses?.map((x: any) => (
              <div key={x.stepId}>
                <strong>
                  {
                    r.data.planSnapshot.steps.find(
                      (s: any) => s.id === x.stepId,
                    )?.text
                  }
                </strong>
                <p>
                  {x.answer ? "Yes" : "No"} · {x.comment}
                </p>
                <EvidenceView media={x.media ?? []} />
              </div>
            ))}
          </details>
        ))}
      </section>
    </>
  );
}
