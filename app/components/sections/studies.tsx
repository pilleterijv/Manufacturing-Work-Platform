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
export default function Studies({
  data,
  save,
  busy,
}: {
  data: Data;
  save: Save;
  busy: boolean;
}) {
  const [cycles, setCycles] = useState<Cycle[]>([]),
    [equipment, setEquipment] = useState(""),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <section className="panel">
        <h2>New time study</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (new FormData(e.currentTarget).get("timerRunning") === "yes") {
              setError("Stop the timer before saving");
              return;
            }
            if (!cycles.length) {
              setError("Record at least one observation");
              return;
            }
            if (
              await save({
                action: "study",
                title,
                equipmentId: equipment,
                cycles,
              })
            ) {
              setCycles([]);
              setTitle("");
              setError("");
            }
          }}
        >
          <div className="form-grid">
            <Field label="Study name">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                required
                placeholder="e.g. Label application baseline"
              />
            </Field>
            <Field label="Equipment">
              <EquipmentSelect
                data={data}
                value={equipment}
                onChange={setEquipment}
              />
            </Field>
          </div>
          <Timer cycles={cycles} setCycles={setCycles} />
          {error && <div className="error">{error}</div>}
          <Submit busy={busy}>Save time study</Submit>
        </form>
      </section>
      <div className="section-title">
        <h2>Saved studies</h2>
      </div>
      <History
        data={data}
        records={data.records.filter((r) => r.kind === "study")}
      />
    </>
  );
}
