"use client";
import LeaderHandoff, { type LeaderHandoffData } from "../leader-handoff";
import {confirmDraftChange} from "../floor-safety";
import EvidenceInput from "../evidence-input";
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
  leader = false,
  shiftNames = ["Day", "Night"],
}: {
  data: Data;
  save: Save;
  busy: boolean;
  audit: boolean;
  leader?: boolean;
  shiftNames?: string[];
}) {
  const uploads = useRef(0);
  const [handoff, setHandoff] = useState<LeaderHandoffData>({
    shift: "",
    notes: "",
    rooms: [],
  });
  const latest = data.standards.filter(
    (s) =>
      !s.archived &&
      s.kind === (audit ? "audit" : "run") &&
      (audit ? (s.workflow === "leader") === leader : true),
  );
  const [id, setId] = useState(""),
    [responses, setResponses] = useState<
      Record<
        string,
        {
          answer: boolean | null;
          photo: string | null;
          video?: string | null;
          comment: string;
          at?: string;
          fiveSAuditId?: string;
        }
      >
    >({}),
    [cycles, setCycles] = useState<Cycle[]>([]),
    [started, setStarted] = useState(new Date().toISOString()),
    [operator, setOperator] = useState(""),
    [localError, setLocalError] = useState(""),
    [uploading, setUploading] = useState(false);
  const [fiveS, setFiveS] = useState<any>(null);
  useEffect(() => {
    if (audit && data.standards.some((s) => s.steps.some((x) => x.fiveSPlanId)))
      api("/api/five-s")
        .then(setFiveS)
        .catch((e) => setLocalError(e.message));
  }, [audit, data.standards]);
  const s = data.standards.find((s) => s.id === id);
  function select(id: string) {
    if(!confirmDraftChange())return;
    setId(id);
    setResponses({});
    setCycles([]);
    setStarted(new Date().toISOString());
    setLocalError("");
    setHandoff({ shift: "", notes: "", rooms: [] });
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
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h2>
            {leader
              ? "Complete assigned DL/TL Standard Work"
              : audit
                ? "Complete a standard-work audit"
                : "Start a verification"}
          </h2>
          <span className="badge">
            {leader ? "DL/TL" : audit ? "PROCESS AUDIT" : "STANDARD WORK"}
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
                {s.title} · revision {s.revision} ·{" "}
                {(() => {
                  const e = data.equipment.find((e) => e.id === s.equipmentId);
                  return e
                    ? [e.plant, e.department, e.area, e.line, e.name]
                        .filter(Boolean)
                        .join(" / ")
                    : s.equipmentId;
                })()}
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
                    (step.photo &&
                      !responses[step.id]?.photo &&
                      !responses[step.id]?.video),
                )
              ) {
                setLocalError(
                  "Answer every step and attach each required photo or video",
                );
                return;
              }
              if (
                await save({
                  action: audit ? "audit" : "run",
                  standardId: id,
                  started,
                  operator,
                  ...(leader ? { handoff } : {}),
                  responses: s.steps.map((step) => ({
                    stepId: step.id,
                    ...responses[step.id],
                  })),
                  ...(audit && !leader && cycles.length ? { cycles } : {}),
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
              {!leader && <span>Target {s.target}s</span>}
            </div>
            <div className={audit && !leader ? "audit-grid" : ""}>
              <div>
                {audit && !leader && (
                  <Field label="Operator / context (optional)">
                    <input
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      maxLength={150}
                      placeholder="Operator name or employee ID"
                    />
                  </Field>
                )}
                {s.steps.map((step, i) => (
                  <section className="step" key={step.id}>
                    {step.group && (
                      <p className="eyebrow">
                        {step.group}
                        {step.timing ? " · " + step.timing : ""}
                      </p>
                    )}
                    <div className="step-heading">
                      <span className="step-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{step.text}</h3>
                        {step.fiveSPlanId && (
                          <Field label="Completed linked 5S audit">
                            <select
                              required
                              value={responses[step.id]?.fiveSAuditId ?? ""}
                              onChange={(e) =>
                                update(step.id, {
                                  fiveSAuditId: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                Complete the linked audit in 5S audits, then
                                return here
                              </option>
                              {fiveS?.records
                                .filter(
                                  (r: any) =>
                                    r.planId === step.fiveSPlanId &&
                                    r.userId === fiveS.userId,
                                )
                                .map((r: any) => (
                                  <option key={r.id} value={r.id}>
                                    {r.snapshot.title} · {r.score}/{r.maximum} ·{" "}
                                    {new Date(r.createdAt).toLocaleString()}
                                  </option>
                                ))}
                            </select>
                          </Field>
                        )}
                        <p className="small muted">
                          {step.photo
                            ? "Photo or video evidence required"
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
                    <EvidenceInput
                      singleKinds
                      label={
                        step.photo
                          ? "Evidence photo or video · required"
                          : "Evidence photo or video · optional"
                      }
                      value={[
                        ...(responses[step.id]?.photo
                          ? [
                              {
                                id: responses[step.id].photo!,
                                kind: "photo" as const,
                                caption: "",
                              },
                            ]
                          : []),
                        ...(responses[step.id]?.video
                          ? [
                              {
                                id: responses[step.id].video!,
                                kind: "video" as const,
                                caption: "",
                              },
                            ]
                          : []),
                      ]}
                      onBusy={(b) => {
                        uploads.current = Math.max(
                          0,
                          uploads.current + (b ? 1 : -1),
                        );
                        setUploading(uploads.current > 0);
                      }}
                      onChange={(items) =>
                        update(step.id, {
                          photo:
                            items.find((m) => m.kind === "photo")?.id ?? null,
                          video:
                            items.find((m) => m.kind === "video")?.id ?? null,
                        })
                      }
                    />
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
              {audit && !leader && (
                <div>
                  <Timer
                    cycles={cycles}
                    setCycles={setCycles}
                    audit
                    target={s.target}
                    tolerance={s.tolerance}
                  />
                  <p className="small muted">
                    Optional cycle timestamps and the current standard criteria
                    are preserved with this audit.
                  </p>
                </div>
              )}
            </div>
            {leader && (
              <LeaderHandoff
                value={handoff}
                onChange={setHandoff}
                shifts={shiftNames}
              />
            )}
            {localError && (
              <div className="error" role="alert">
                {localError}
              </div>
            )}
            <Submit busy={busy || uploading}>
              {leader
                ? "Complete DL/TL Standard Work"
                : audit
                  ? "Complete standard-work audit"
                  : "Complete standard work"}
            </Submit>
          </form>
        )}
      </section>
      <div className="section-title">
        <h2>
          {leader
            ? "DL/TL Standard Work history"
            : audit
              ? "Standard work audit history"
              : "Completed verifications"}
        </h2>
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
