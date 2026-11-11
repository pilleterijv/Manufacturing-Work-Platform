"use client";
import { leaderStarter } from "@/lib/reference-catalog";
import PersonSelect from "../person-select";
import { LocationPicker } from "../location-picker";
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
export default function Manage({
  data,
  save,
  busy,
  canStandards = true,
  canEquipment = true,
}: {
  data: Data;
  save: Save;
  busy: boolean;
  canStandards?: boolean;
  canEquipment?: boolean;
}) {
  const [fiveS, setFiveS] = useState<any>(null);
  useEffect(() => {
    api("/api/five-s")
      .then(setFiveS)
      .catch(() => {});
  }, []);
  const [editing, setEditing] = useState(""),
    [revisions, setRevisions] = useState<Standard[]>([]),
    [moreRevisions, setMoreRevisions] = useState(false),
    [revisionError, setRevisionError] = useState(""),
    [revisionLoading, setRevisionLoading] = useState(false),
    [kind, setKind] = useState("run"),
    [workflow, setWorkflow] = useState("process"),
    [assignees, setAssignees] = useState<string[]>([]),
    [title, setTitle] = useState(""),
    [equipment, setEquipment] = useState(""),
    [target, setTarget] = useState(45),
    [tolerance, setTolerance] = useState(10),
    [steps, setSteps] = useState<Step[]>([
      { id: crypto.randomUUID(), text: "", photo: false },
    ]);
  async function history(more = false) {
    const standard = data.standards.find((s) => s.id === editing);
    if (!standard || revisionLoading) return;
    setRevisionLoading(true);
    setRevisionError("");
    try {
      const next = await api(
        "/api/platform?" +
          new URLSearchParams({
            view: "revisions",
            family: standard.family,
            ...(more ? { before: String(revisions.at(-1)?.revision) } : {}),
          }),
      );
      setRevisions((prev) =>
        more ? [...prev, ...next.revisions] : next.revisions,
      );
      setMoreRevisions(next.hasMore);
    } catch (error) {
      setRevisionError((error as Error).message);
    } finally {
      setRevisionLoading(false);
    }
  }
  function load(id: string) {
    setRevisions([]);
    setMoreRevisions(false);
    setRevisionError("");
    setEditing(id);
    const s = data.standards.find((x) => x.id === id);
    setKind(s?.kind ?? "run");
    setWorkflow(s?.workflow ?? "process");
    setAssignees(s?.assigneeIds ?? []);
    setTitle(s?.title ?? "");
    setEquipment(s?.equipmentId ?? "");
    setTarget(s?.target ?? 45);
    setTolerance(s?.tolerance ?? 10);
    setSteps(s?.steps ?? [{ id: crypto.randomUUID(), text: "", photo: false }]);
  }
  return (
    <>
      {canStandards && (
        <section className="panel">
          <h2>Standard work editor</h2>
          <p className="muted">
            Publishing a change creates a new revision. Existing results retain
            their original steps and timing criteria.
          </p>
          <Field label="Create or revise">
            <select value={editing} onChange={(e) => load(e.target.value)}>
              <option value="">New standard</option>
              {data.standards.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · revision {s.revision} ·{" "}
                  {(() => {
                    const e = data.equipment.find(
                      (e) => e.id === s.equipmentId,
                    );
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
          {editing && (
            <button
              className="outline"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (
                  confirm(
                    "Remove this standard and its tasks from active use? Completed records and their original revisions will remain available.",
                  )
                ) {
                  if (await save({ action: "retire-standard", id: editing }))
                    load("");
                }
              }}
            >
              Delete / retire this standard and its tasks
            </button>
          )}
          {editing && (
            <div className="revision-history">
              <button
                className="outline"
                type="button"
                disabled={revisionLoading}
                onClick={() => void history()}
              >
                View revision history
              </button>
              {revisionError && <p role="alert">{revisionError}</p>}
              {revisions.map((revision) => (
                <details key={revision.id}>
                  <summary>
                    {revision.title} · revision {revision.revision}
                  </summary>
                  <p>
                    Target {revision.target}s · tolerance {revision.tolerance}%
                  </p>
                  <ol>
                    {revision.steps.map((step) => (
                      <li key={step.id}>
                        {step.text}
                        {step.photo ? " (photo required)" : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
              {moreRevisions && (
                <button
                  className="outline"
                  disabled={revisionLoading}
                  type="button"
                  onClick={() => void history(true)}
                >
                  Load older revisions
                </button>
              )}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await save({
                  action: "standard",
                  kind,
                  workflow,
                  assigneeIds: assignees,
                  title,
                  equipmentId: equipment,
                  target,
                  tolerance,
                  steps,
                  ...(editing
                    ? {
                        family: data.standards.find((s) => s.id === editing)
                          ?.family,
                      }
                    : {}),
                })
              )
                load("");
            }}
          >
            <div className="form-grid">
              <Field label="Task type">
                <select
                  value={workflow === "leader" ? "leader" : kind}
                  disabled={!!editing}
                  onChange={(e) => {
                    setKind(
                      e.target.value === "leader" ? "audit" : e.target.value,
                    );
                    setWorkflow(
                      e.target.value === "leader" ? "leader" : "process",
                    );
                  }}
                >
                  <option value="run">Operator Standard Work</option>
                  <option value="leader">DL/TL Standard Work</option>
                  <option value="audit">
                    Standard work audit (timed process check)
                  </option>
                </select>
              </Field>
              {editing && kind === "audit" && (
                <Field label="Checklist purpose for new revision">
                  <select
                    value={workflow}
                    onChange={(e) => setWorkflow(e.target.value)}
                  >
                    <option value="process">Standard-work audit</option>
                    <option value="leader">DL/TL leader shift work</option>
                  </select>
                </Field>
              )}
              {workflow === "leader" && (
                <div>
                  <button
                    className="outline"
                    type="button"
                    onClick={() => {
                      setTitle("Compressing leader standard work");
                      setSteps(
                        leaderStarter.map(([group, text, timing]) => ({
                          id: crypto.randomUUID(),
                          text,
                          group,
                          timing,
                          photo: false,
                        })),
                      );
                    }}
                  >
                    Use compressing leader-work starter
                  </button>
                  <p className="small muted">
                    Review and edit the checklist against your approved local
                    standard before publishing.
                  </p>
                </div>
              )}
              <Field label="Standard title">
                <input
                  required
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Equipment">
                <EquipmentSelect
                  data={data}
                  value={equipment}
                  onChange={setEquipment}
                />
              </Field>
              {workflow !== "leader" && (
                <>
                  <Field label="Target cycle time (seconds)">
                    <input
                      type="number"
                      min="0.01"
                      max="86400"
                      step="0.01"
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                      required
                    />
                  </Field>
                  <Field label="Allowed tolerance (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      required
                    />
                  </Field>
                </>
              )}
            </div>
            {kind === "audit" && (
              <Field label="Assigned DL/TLs (optional; no selection means all permitted people in the area)">
                <PersonSelect
                  aria-label="Assigned DL/TLs"
                  people={data.users.filter(
                    (u) =>
                      u.active &&
                      ["Admin", "Manager", "DL/TL"].includes(u.role),
                  )}
                  multiple
                  value={assignees}
                  onChange={(e) =>
                    setAssignees(
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                />
              </Field>
            )}
            {steps.map((step, i) => (
              <div className="editor-step" key={step.id}>
                <Field label={`Step ${i + 1}`}>
                  <input
                    required
                    maxLength={500}
                    value={step.text}
                    onChange={(e) =>
                      setSteps(
                        steps.map((s, j) =>
                          j === i ? { ...s, text: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </Field>
                {workflow === "leader" && (
                  <div className="form-grid">
                    <Field label={`Leader task section ${i + 1}`}>
                      <input
                        maxLength={100}
                        value={step.group || ""}
                        onChange={(e) =>
                          setSteps(
                            steps.map((old, j) =>
                              j === i ? { ...old, group: e.target.value } : old,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={`When to complete task ${i + 1}`}>
                      <input
                        maxLength={150}
                        value={step.timing || ""}
                        onChange={(e) =>
                          setSteps(
                            steps.map((old, j) =>
                              j === i
                                ? { ...old, timing: e.target.value }
                                : old,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                )}
                {kind === "audit" && (
                  <Field label="Linked 5S area audit (optional)">
                    <select
                      value={step.fiveSPlanId ?? ""}
                      onChange={(e) =>
                        setSteps(
                          steps.map((s, j) =>
                            i === j
                              ? {
                                  ...s,
                                  fiveSPlanId: e.target.value || undefined,
                                }
                              : s,
                          ),
                        )
                      }
                    >
                      <option value="">No linked 5S audit</option>
                      {fiveS?.plans
                        .filter((p: any) => p.active)
                        .map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ·{" "}
                            {
                              fiveS.areas.find(
                                (l: any) => l.id === p.locationId,
                              )?.area
                            }
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={step.photo}
                    onChange={(e) =>
                      setSteps(
                        steps.map((s, j) =>
                          j === i ? { ...s, photo: e.target.checked } : s,
                        ),
                      )
                    }
                  />
                  Photo required
                </label>
                <button
                  className="text-button"
                  type="button"
                  disabled={steps.length === 1}
                  onClick={() => setSteps(steps.filter((_, j) => i !== j))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="button-row">
              <button
                type="button"
                className="outline"
                disabled={steps.length >= 100}
                onClick={() =>
                  setSteps([
                    ...steps,
                    { id: crypto.randomUUID(), text: "", photo: false },
                  ])
                }
              >
                + Add step
              </button>
              <Submit busy={busy}>
                {editing ? "Publish new revision" : "Publish standard"}
              </Submit>
            </div>
          </form>
        </section>
      )}
      {canEquipment && (
        <section className="panel">
          <h2>Add equipment</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (await save({ action: "equipment", ...Object.fromEntries(f) }))
                form.reset();
            }}
          >
            <div className="form-grid">
              <Field label="Equipment name">
                <input name="name" required maxLength={150} />
              </Field>
              <LocationPicker data={data} />
            </div>
            <Submit busy={busy}>Add equipment</Submit>
          </form>
          <div className="equipment-list">
            {data.equipment.map((e) => (
              <p key={e.id}>
                <strong>{e.name}</strong>
                <span>
                  {[e.plant, e.department, e.area, e.line].join(" / ")}
                </span>
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
