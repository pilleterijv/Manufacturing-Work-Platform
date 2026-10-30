"use client";
import { useState, useEffect, useRef } from "react";
import { stats, capabilities, roles, type Capability } from "@/lib/rules";
import type { Data, Step, Cycle, Standard } from "@/lib/workspace-types";
import { api } from "@/lib/client-api";
import {
  Field,
  Submit,
  fmt,
  Metric,
  History,
  EquipmentSelect,
} from "../shared";
type Save = (body: unknown) => Promise<boolean>;
import { Timer } from "../timer";
export default function Work({
  data,
  save,
  busy,
  audit,
}: {
  data: Data;
  save: Save;
  busy: boolean;
  audit: boolean;
}) {
  const latest = data.standards.filter(
    (s) =>
      !data.standards.some(
        (t) => t.family === s.family && t.revision > s.revision,
      ),
  );
  const [id, setId] = useState(""),
    [responses, setResponses] = useState<
      Record<
        string,
        {
          answer: boolean | null;
          photo: string | null;
          comment: string;
          at?: string;
        }
      >
    >({}),
    [cycles, setCycles] = useState<Cycle[]>([]),
    [started, setStarted] = useState(new Date().toISOString()),
    [operator, setOperator] = useState(""),
    [localError, setLocalError] = useState(""),
    [uploading, setUploading] = useState(false);
  const s = data.standards.find((s) => s.id === id);
  function select(id: string) {
    setId(id);
    setResponses({});
    setCycles([]);
    setStarted(new Date().toISOString());
    setLocalError("");
  }
  function update(step: string, patch: object) {
    setResponses((prev) => ({
      ...prev,
      [step]: {
        ...(prev[step] ?? { answer: null, photo: null, comment: "" }),
        ...patch,
        at: new Date().toISOString(),
      },
    }));
  }
  async function upload(step: string, file: File) {
    setUploading(true);
    setLocalError("");
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("Photos must be under 8 MB");
      const image = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const p = await api("/api/photos", { image });
      update(step, { photo: p.id });
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h2>{audit ? "New standard work audit" : "Start a verification"}</h2>
          <span className="badge">
            {audit ? "SUPERVISOR" : "STANDARD WORK"}
          </span>
        </div>
        <Field label="Standard work">
          <select
            aria-label="Standard work"
            value={id}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">Select a process</option>
            {latest.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · revision {s.revision}
              </option>
            ))}
          </select>
        </Field>
        {s && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLocalError("");
              if (new FormData(e.currentTarget).get("timerRunning") === "yes") {
                setLocalError("Stop the timer before saving");
                return;
              }
              if (
                s.steps.some(
                  (step) =>
                    responses[step.id]?.answer == null ||
                    (step.photo && !responses[step.id]?.photo),
                )
              ) {
                setLocalError(
                  "Answer every step and attach each required photo",
                );
                return;
              }
              if (audit && !cycles.length) {
                setLocalError("Record at least one audit cycle");
                return;
              }
              if (
                await save({
                  action: audit ? "audit" : "run",
                  standardId: id,
                  started,
                  operator,
                  responses: s.steps.map((step) => ({
                    stepId: step.id,
                    ...responses[step.id],
                  })),
                  ...(audit ? { cycles } : {}),
                })
              ) {
                select("");
                setOperator("");
              }
            }}
          >
            <div className="process-meta">
              <span>
                ▦ {data.equipment.find((e) => e.id === s.equipmentId)?.name}
              </span>
              <span>Revision {s.revision}</span>
              <span>Target {s.target}s</span>
            </div>
            <div className={audit ? "audit-grid" : ""}>
              <div>
                {audit && (
                  <Field label="Operator being audited">
                    <input
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      maxLength={150}
                      required
                      placeholder="Operator name or employee ID"
                    />
                  </Field>
                )}
                {s.steps.map((step, i) => (
                  <section className="step" key={step.id}>
                    <div className="step-heading">
                      <span className="step-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{step.text}</h3>
                        <p className="small muted">
                          {step.photo
                            ? "Photo evidence required"
                            : "Verify against the approved standard"}
                        </p>
                      </div>
                    </div>
                    <div className="yes-no">
                      {[true, false].map((answer) => (
                        <button
                          key={String(answer)}
                          type="button"
                          aria-pressed={responses[step.id]?.answer === answer}
                          className={
                            responses[step.id]?.answer === answer
                              ? answer
                                ? "selected-yes"
                                : "selected-no"
                              : ""
                          }
                          onClick={() => update(step.id, { answer })}
                        >
                          {answer ? "✓ Yes" : "✕ No"}
                        </button>
                      ))}
                    </div>
                    <Field
                      label={
                        step.photo
                          ? "Evidence photo · required"
                          : "Evidence photo · optional"
                      }
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void upload(step.id, f);
                        }}
                      />
                    </Field>
                    {responses[step.id]?.photo && (
                      <img
                        className="photo-preview"
                        src={`/api/photos/${responses[step.id].photo}`}
                        alt={`Evidence for step ${i + 1}`}
                      />
                    )}
                    <Field label="Comment">
                      <textarea
                        maxLength={1000}
                        rows={2}
                        value={responses[step.id]?.comment ?? ""}
                        onChange={(e) =>
                          update(step.id, { comment: e.target.value })
                        }
                        placeholder="Add context or describe an issue"
                      />
                    </Field>
                  </section>
                ))}
              </div>
              {audit && (
                <div>
                  <Timer
                    cycles={cycles}
                    setCycles={setCycles}
                    audit
                    target={s.target}
                    tolerance={s.tolerance}
                  />
                  <p className="small muted">
                    Cycle timestamps and the current standard criteria are
                    preserved with this audit.
                  </p>
                </div>
              )}
            </div>
            {localError && (
              <div className="error" role="alert">
                {localError}
              </div>
            )}
            <Submit busy={busy || uploading}>
              {audit ? "Save audit" : "Complete standard work"}
            </Submit>
          </form>
        )}
      </section>
      <div className="section-title">
        <h2>{audit ? "Audit history" : "Completed verifications"}</h2>
        <span className="muted">Historical revisions preserved</span>
      </div>
      <History
        data={data}
        records={data.records.filter(
          (r) => r.kind === (audit ? "audit" : "run"),
        )}
      />
    </>
  );
}
