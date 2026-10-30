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
export default function Analytics({ data }: { data: Data }) {
  const runs = data.records.filter((r) => r.kind === "run"),
    responses = runs.flatMap((r) => r.data.responses ?? []),
    no = responses.filter((a) => !a.answer).length,
    studies = data.records.filter((r) => r.kind === "study");
  return (
    <>
      <div className="metrics">
        <Metric
          label="Completed verifications"
          value={runs.length}
          detail="Completed records, not scheduled tasks"
        />
        <Metric
          label="No response rate"
          value={
            responses.length ? `${fmt((no / responses.length) * 100)}%` : "—"
          }
          detail={`${no} No answers / ${responses.length} responses`}
        />
        <Metric
          label="Average completion"
          value={
            runs.length
              ? `${fmt(runs.reduce((s, r) => s + r.data.durationSeconds, 0) / runs.length)}s`
              : "—"
          }
          detail="Elapsed verification time"
        />
        <Metric
          label="Audit follow-ups"
          value={
            data.records.filter((r) => r.kind === "audit" && r.data.followUp)
              .length
          }
          detail="Failed checks or cycles over target"
          accent
        />
      </div>
      <section className="panel">
        <h2>Time study statistics</h2>
        <p className="muted">
          Calculated from raw observations by work element. Standard deviation
          uses the population formula.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Study / element",
                  "N",
                  "Average",
                  "Median",
                  "Min",
                  "Max",
                  "Range",
                  "Std. dev.",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studies.flatMap((r) =>
                [
                  ...new Set<string>(
                    r.data.cycles.map((c: Cycle) => c.element),
                  ),
                ].map((element) => {
                  const s = stats(
                    r.data.cycles
                      .filter((c: Cycle) => c.element === element)
                      .map((c: Cycle) => c.seconds),
                  )!;
                  return (
                    <tr key={r.id + element}>
                      <td>
                        <strong>{r.data.title}</strong>
                        <small>{element}</small>
                      </td>
                      <td>{s.count}</td>
                      {[
                        s.average,
                        s.median,
                        s.min,
                        s.max,
                        s.range,
                        s.standardDeviation,
                      ].map((n, i) => (
                        <td key={i}>{fmt(n)}s</td>
                      ))}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          {!studies.length && (
            <p className="empty">Save a time study to see its statistics.</p>
          )}
        </div>
      </section>
      <section className="panel">
        <h2>Failures by equipment and step</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Standard / revision</th>
                <th>Step</th>
                <th>No responses</th>
              </tr>
            </thead>
            <tbody>
              {data.standards.flatMap((s) =>
                s.steps.map((step) => {
                  const count = runs
                    .filter((r) => r.data.snapshot.id === s.id)
                    .flatMap((r) => r.data.responses)
                    .filter((a) => a.stepId === step.id && !a.answer).length;
                  return count ? (
                    <tr key={s.id + step.id}>
                      <td>
                        {
                          data.equipment.find((e) => e.id === s.equipmentId)
                            ?.name
                        }
                      </td>
                      <td>
                        {s.title} · r{s.revision}
                      </td>
                      <td>{step.text}</td>
                      <td>{count}</td>
                    </tr>
                  ) : null;
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small muted">
        Dashboard history is limited to the latest 2,000 accessible records.
        Excel exports include all accessible records. A scheduled completion
        percentage needs a future scheduling module.
      </p>
    </>
  );
}
