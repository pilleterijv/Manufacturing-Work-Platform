"use client";
import RefreshControl, { useSectionRefresh } from "../refresh-control";
import { useEffect, useRef, useState } from "react";
import { api, filterUrl } from "@/lib/client-api";
import { fiveSPillars } from "@/lib/floor-rules";
import EvidenceInput, { EvidenceView } from "../evidence-input";
import { Field } from "../shared";
import PersonSelect from "../person-select";
import { confirmDraftChange } from "../floor-safety";
export default function FiveS({
  userId,
  admin,
}: {
  userId: string;
  admin: boolean;
}) {
  const [showRetired, setShowRetired] = useState(false);
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [responses, setResponses] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const uploads = useRef(0);
  const loadSequence = useRef(0);
  const load = async () => {
    const sequence = ++loadSequence.current;
    const next = await api("/api/five-s");
    if (sequence === loadSequence.current) setData(next);
  };
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
      const r = await api("/api/five-s", body);
      setDraft(null);
      setSelected(null);
      setNotice(r.id ? `5S audit saved. Reference: ${r.id}` : "5S plan saved.");
      try {
        await load();
      } catch {
        setNotice("5S saved. Refresh the list before another entry.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const area = (id: string) => {
    const l = data?.areas.find((l: any) => l.id === id);
    return l
      ? [l.plant, l.department, l.area, l.line].filter(Boolean).join(" / ")
      : id;
  };
  return (
    <>
      <section className="panel">
        <h2>5S area audits</h2>
        <p>
          Score each item from 0 (not in place) to 5 (fully sustained). Scores
          and evidence retain the audit’s original questions.
        </p>
        {data?.canManage && (
          <button
            className="outline"
            onClick={() => {
              if (!confirmDraftChange()) return;
              setSelected(null);
              setDraft({
                title: "",
                locationId: "",
                assigneeIds: [],
                active: true,
                questions: fiveSPillars.map((pillar) => ({
                  id: crypto.randomUUID(),
                  pillar,
                  text: (
                    {
                      Sort: "Only necessary items are present",
                      "Set in order": "Items have identified storage locations",
                      Shine: "Area is clean and defects are visible",
                      Standardize: "Visual standards are current and followed",
                      Sustain: "Checks and follow-up actions are maintained",
                    } as any
                  )[pillar],
                  photo: false,
                })),
              });
            }}
          >
            Create 5S plan
          </button>
        )}{" "}
        <a className="outline" href={filterUrl("/api/five-s?format=xlsx")}>
          Export 5S history
        </a>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
      {draft && (
        <section className="panel">
          <h2>{draft.id ? "Edit 5S plan" : "New 5S plan"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ action: "save", ...draft });
            }}
          >
            <Field label="5S title">
              <input
                required
                maxLength={150}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Audit area">
              <select
                required
                disabled={!!draft.id}
                value={draft.locationId}
                onChange={(e) =>
                  setDraft({ ...draft, locationId: e.target.value })
                }
              >
                <option value="">Choose department / area</option>
                {data.areas.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {area(l.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned auditors (none means any permitted person)">
              <PersonSelect
                multiple
                people={data.people}
                value={draft.assigneeIds}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    assigneeIds: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              />
            </Field>
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
            {draft.questions.map((q: any, i: number) => (
              <div className="editor-step" key={q.id}>
                <Field label={`5S pillar ${i + 1}`}>
                  <select
                    value={q.pillar}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        questions: draft.questions.map((x: any, j: number) =>
                          i === j ? { ...x, pillar: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {fiveSPillars.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`5S question ${i + 1}`}>
                  <input
                    required
                    maxLength={500}
                    value={q.text}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        questions: draft.questions.map((x: any, j: number) =>
                          i === j ? { ...x, text: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={q.photo}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        questions: draft.questions.map((x: any, j: number) =>
                          i === j ? { ...x, photo: e.target.checked } : x,
                        ),
                      })
                    }
                  />
                  Photo or video required
                </label>
                <button
                  className="outline"
                  type="button"
                  disabled={draft.questions.length <= 5}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      questions: draft.questions.filter(
                        (_: any, j: number) => i !== j,
                      ),
                    })
                  }
                >
                  Remove question
                </button>
              </div>
            ))}
            <div className="button-row">
              <button
                className="outline"
                type="button"
                disabled={draft.questions.length >= 100}
                onClick={() =>
                  setDraft({
                    ...draft,
                    questions: [
                      ...draft.questions,
                      {
                        id: crypto.randomUUID(),
                        pillar: "Sort",
                        text: "",
                        photo: false,
                      },
                    ],
                  })
                }
              >
                Add question
              </button>
              <button className="primary" disabled={busy}>
                Save 5S plan
              </button>
              <button
                className="outline"
                type="button"
                onClick={() => setDraft(null)}
              >
                Cancel edit
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Area audit plans</h2>
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
                {p.title} {!p.active && <span className="badge">Paused</span>}
              </h3>
              <p>
                {area(p.locationId)} ·{" "}
                {p.assigneeIds.length
                  ? p.assigneeIds
                      .map(
                        (id: string) =>
                          data.people.find((x: any) => x.id === id)?.name ?? id,
                      )
                      .join(", ")
                  : "Any permitted auditor"}
              </p>
              <div className="button-row">
                {p.active &&
                  (admin ||
                    !p.assigneeIds.length ||
                    p.assigneeIds.includes(userId)) && (
                    <button
                      className="primary"
                      onClick={() => {
                        if (!confirmDraftChange()) return;
                        setDraft(null);
                        setSelected(p);
                        setResponses({});
                      }}
                    >
                      Perform 5S audit
                    </button>
                  )}
                {data.canManage && (
                  <button
                    className="outline"
                    onClick={() => {
                      if (!confirmDraftChange()) return;
                      setSelected(null);
                      setDraft(p);
                    }}
                  >
                    Edit 5S plan
                  </button>
                )}
              </div>
            </article>
          ))}
        {data && !data.plans.length && <p>No 5S plans match these filters.</p>}
      </section>
      {selected && (
        <section className="panel">
          <h2>Perform 5S · {selected.title}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                selected.questions.some(
                  (q: any) =>
                    responses[q.id]?.score == null ||
                    (q.photo && !responses[q.id]?.media?.length),
                )
              ) {
                setError("Score each question and attach required evidence");
                return;
              }
              void save({
                action: "complete",
                id: selected.id,
                version: selected.version,
                responses: selected.questions.map((q: any) => ({
                  questionId: q.id,
                  comment: "",
                  media: [],
                  ...responses[q.id],
                })),
              });
            }}
          >
            {selected.questions.map((q: any, i: number) => {
              const patch = (v: any) =>
                setResponses((r) => ({
                  ...r,
                  [q.id]: { comment: "", media: [], ...r[q.id], ...v },
                }));
              return (
                <section className="step" key={q.id}>
                  <h3>
                    {q.pillar} · {q.text}
                  </h3>
                  <Field label={`Score ${i + 1} (0–5)`}>
                    <select
                      required
                      value={responses[q.id]?.score ?? ""}
                      onChange={(e) =>
                        patch({
                          score:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Choose score</option>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`5S comment ${i + 1}`}>
                    <textarea
                      maxLength={1000}
                      value={responses[q.id]?.comment ?? ""}
                      onChange={(e) => patch({ comment: e.target.value })}
                    />
                  </Field>
                  <EvidenceInput
                    label={
                      q.photo
                        ? "5S photo or video · required"
                        : "5S photo or video · optional"
                    }
                    value={responses[q.id]?.media ?? []}
                    onChange={(media) => patch({ media })}
                    onBusy={(b) => {
                      uploads.current = Math.max(
                        0,
                        uploads.current + (b ? 1 : -1),
                      );
                      setUploading(uploads.current > 0);
                    }}
                  />
                </section>
              );
            })}
            <button className="primary" disabled={busy || uploading}>
              Save completed 5S audit
            </button>
            <button
              className="outline"
              type="button"
              onClick={() => setSelected(null)}
            >
              Cancel audit
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>5S audit history</h2>
        <RefreshControl onRefresh={() => load()} />
        <p className="small muted">
          Latest 100 matching audits. Export includes the full matching history.
        </p>
        {data?.records.map((r: any) => (
          <details key={r.id}>
            <summary>
              {r.snapshot.title} · {r.score}/{r.maximum} ·{" "}
              {new Date(r.createdAt).toLocaleString()}
            </summary>
            <p>
              Reference {r.id} · {area(r.locationId)} ·{" "}
              {data.people.find((p: any) => p.id === r.userId)?.name ??
                r.userId}
            </p>
            {r.responses.map((v: any) => (
              <div key={v.questionId}>
                <strong>
                  {
                    r.snapshot.questions.find((q: any) => q.id === v.questionId)
                      ?.text
                  }{" "}
                  · {v.score}/5
                </strong>
                <p>{v.comment}</p>
                <EvidenceView media={v.media} />
              </div>
            ))}
          </details>
        ))}
      </section>
    </>
  );
}
