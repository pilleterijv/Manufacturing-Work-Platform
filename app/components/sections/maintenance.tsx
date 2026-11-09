"use client";
import { useState, useEffect, useRef } from "react";
import { api, filterUrl } from "@/lib/client-api";
import EvidenceInput, { EvidenceView } from "../evidence-input";
import { Field } from "../shared";
import type { Evidence } from "@/lib/evidence-schema";
export default function Maintenance({
  userId,
  admin,
}: {
  userId: string;
  admin: boolean;
}) {
  const uploads = useRef(0);
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [responses, setResponses] = useState<
      Record<string, { answer: boolean; comment: string; media: Evidence[] }>
    >({}),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(more = false) {
    const d = await api(
      "/api/maintenance" +
        (more && data?.cursor ? "?cursor=" + data.cursor : ""),
    );
    setData((old: any) =>
      more ? { ...d, plans: [...old.plans, ...d.plans] } : d,
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function save(body: any) {
    setBusy(true);
    setError("");
    try {
      await api("/api/maintenance", body);
      await load();
      setSelected(null);
      setDraft(null);
      setNotice("PM saved.");
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
        <h2>Machine preventive maintenance</h2>
        <p>Assigned PM tasks, due dates and permanent completion evidence.</p>
        <a className="outline" href={filterUrl("/api/maintenance?format=xlsx")}>
          Export PM plans and history
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
                intervalDays: 30,
                active: true,
                steps: [{ id: crypto.randomUUID(), text: "", photo: false }],
              });
            }}
          >
            Create PM plan
          </button>
        )}
      </section>
      {draft && (
        <section className="panel">
          <h2>{draft.id ? "Edit PM plan" : "New PM plan"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ action: "save", ...draft });
            }}
          >
            <div className="form-grid">
              <Field label="PM title">
                <input
                  required
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label="PM machine">
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
              <Field label="PM assignee">
                <select
                  required
                  value={draft.assigneeId}
                  onChange={(e) =>
                    setDraft({ ...draft, assigneeId: e.target.value })
                  }
                >
                  <option value="">Choose a person</option>
                  {data.people.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Next PM due">
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
                <Field label={`PM step ${i + 1}`}>
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
                Add PM step
              </button>
              <button className="primary" disabled={busy}>
                Save PM plan
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel PM edit
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>PM task list</h2>
        {data?.plans.map((p: any) => (
          <article className="problem-action" key={p.id}>
            <h3>
              {p.title}{" "}
              <span
                className={
                  "badge " + (p.active && p.nextDue < data.today ? "warn" : "")
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
                    Perform PM
                  </button>
                )}
              {data.canManage && (
                <button
                  onClick={() => {
                    setSelected(null);
                    setDraft(p);
                  }}
                >
                  Edit PM
                </button>
              )}
            </div>
          </article>
        ))}
        {data && !data.plans.length && <p>No PM plans match these filters.</p>}
        {data?.hasMore && (
          <button onClick={() => load(true).catch((e) => setError(e.message))}>
            Load more PM plans
          </button>
        )}
      </section>
      {selected && (
        <section className="panel">
          <h2>Perform PM · {selected.title}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                selected.steps.some(
                  (s: any) =>
                    !responses[s.id] ||
                    (s.photo && !responses[s.id].media.length),
                )
              ) {
                setError(
                  "Answer every PM step and attach required photo/video evidence",
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
                <Field label={`PM comment ${i + 1}`}>
                  <textarea
                    maxLength={1000}
                    value={responses[s.id]?.comment ?? ""}
                    onChange={(e) =>
                      setResponses((r) => ({
                        ...r,
                        [s.id]: {
                          ...(r[s.id] ?? { answer: false, media: [] }),
                          comment: e.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <EvidenceInput
                  label={
                    s.photo
                      ? "PM photo or video · required"
                      : "PM photo or video · optional"
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
                        ...(r[s.id] ?? { answer: false, comment: "" }),
                        media,
                      },
                    }))
                  }
                />
              </section>
            ))}
            <button className="primary" disabled={busy || uploading}>
              Complete PM and save evidence
            </button>
            <button type="button" onClick={() => setSelected(null)}>
              Cancel PM
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>PM completion history</h2>
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
