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
export default function Manage({
  data,
  save,
  busy,
}: {
  data: Data;
  save: Save;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(""),
    [title, setTitle] = useState(""),
    [equipment, setEquipment] = useState(""),
    [target, setTarget] = useState(45),
    [tolerance, setTolerance] = useState(10),
    [steps, setSteps] = useState<Step[]>([
      { id: crypto.randomUUID(), text: "", photo: false },
    ]);
  function load(id: string) {
    setEditing(id);
    const s = data.standards.find((x) => x.id === id);
    setTitle(s?.title ?? "");
    setEquipment(s?.equipmentId ?? "");
    setTarget(s?.target ?? 45);
    setTolerance(s?.tolerance ?? 10);
    setSteps(s?.steps ?? [{ id: crypto.randomUUID(), text: "", photo: false }]);
  }
  return (
    <>
      <section className="panel">
        <h2>Standard work editor</h2>
        <p className="muted">
          Publishing a change creates a new revision. Existing results retain
          their original steps and timing criteria.
        </p>
        <Field label="Create or revise">
          <select value={editing} onChange={(e) => load(e.target.value)}>
            <option value="">New standard</option>
            {data.standards
              .filter(
                (s) =>
                  !data.standards.some(
                    (x) => x.family === s.family && x.revision > s.revision,
                  ),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · revision {s.revision}
                </option>
              ))}
          </select>
        </Field>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                action: "standard",
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
          </div>
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
            {["name", "plant", "department", "area", "line"].map((name) => (
              <Field label={name[0].toUpperCase() + name.slice(1)} key={name}>
                <input
                  name={name}
                  required
                  maxLength={name === "name" ? 150 : 100}
                />
              </Field>
            ))}
          </div>
          <Submit busy={busy}>Add equipment</Submit>
        </form>
        <div className="equipment-list">
          {data.equipment.map((e) => (
            <p key={e.id}>
              <strong>{e.name}</strong>
              <span>{[e.plant, e.department, e.area, e.line].join(" / ")}</span>
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
