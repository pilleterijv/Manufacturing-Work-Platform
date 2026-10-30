"use client";
import { useState, useEffect, useRef } from "react";
import { stats, capabilities, roles, type Capability } from "@/lib/rules";
import type { Data, Step, Cycle, Standard } from "@/lib/workspace-types";
import { api } from "@/lib/client-api";
import { Field, Submit, fmt, Metric, History, EquipmentSelect } from "./shared";
type Save = (body: unknown) => Promise<boolean>;
export function Timer({
  cycles,
  setCycles,
  audit = false,
  target = 0,
  tolerance = 0,
}: {
  cycles: Cycle[];
  setCycles: (v: Cycle[]) => void;
  audit?: boolean;
  target?: number;
  tolerance?: number;
}) {
  const [running, setRunning] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [element, setElement] = useState("Whole cycle");
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(
      () => setElapsed((performance.now() - start.current) / 1000),
      40,
    );
    return () => clearInterval(t);
  }, [running]);
  function record() {
    const seconds = (performance.now() - start.current) / 1000;
    setCycles([
      ...cycles,
      {
        element: element.trim() || "Whole cycle",
        seconds,
        at: new Date().toISOString(),
      },
    ]);
    setRunning(false);
    setElapsed(0);
  }
  const s = stats(cycles.map((c) => c.seconds));
  return (
    <section className="timer-box">
      <div className="section-title">
        <h3>{audit ? "Audit cycle timer" : "Observation timer"}</h3>
        <span className="badge">{cycles.length} observations</span>
      </div>
      {!audit && (
        <Field label="Work element">
          <input
            value={element}
            onChange={(e) => setElement(e.target.value)}
            disabled={running}
            maxLength={150}
          />
        </Field>
      )}
      {audit && (
        <p className="muted">
          Target <strong>{target}s</strong> + {tolerance}% tolerance · limit{" "}
          {fmt(target * (1 + tolerance / 100))}s
        </p>
      )}
      <div className={"clock " + (running ? "running" : "")}>
        {elapsed.toFixed(2)}
        <span>SECONDS</span>
      </div>
      <div className="button-row">
        <button
          type="button"
          className={running ? "danger" : "primary"}
          onClick={() => {
            if (running) record();
            else {
              start.current = performance.now();
              setElapsed(0);
              setRunning(true);
            }
          }}
        >
          {running ? "Stop & record cycle" : "Start cycle"}
        </button>
        {running && (
          <button
            type="button"
            className="outline"
            onClick={() => {
              setRunning(false);
              setElapsed(0);
            }}
          >
            Cancel cycle
          </button>
        )}
      </div>
      {s && (
        <div className="mini-stats">
          <span>
            Average <b>{fmt(s.average)}s</b>
          </span>
          <span>
            Range <b>{fmt(s.range)}s</b>
          </span>
          <span>
            Std. dev. <b>{fmt(s.standardDeviation)}s</b>
          </span>
        </div>
      )}
      {cycles.length > 0 && (
        <ol className="cycles">
          {cycles.map((c, i) => (
            <li key={i}>
              <span>
                {i + 1}. {c.element}
              </span>
              <strong>{fmt(c.seconds)}s</strong>
              {audit && (
                <span
                  className={
                    "badge " +
                    (c.seconds > target * (1 + tolerance / 100) ? "warn" : "")
                  }
                >
                  {c.seconds > target * (1 + tolerance / 100)
                    ? "Over target"
                    : "Within target"}
                </span>
              )}
              <button
                type="button"
                className="text-button"
                aria-label={`Remove cycle ${i + 1}`}
                disabled={running}
                onClick={() => setCycles(cycles.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <input type="hidden" name="timerRunning" value={running ? "yes" : "no"} />
    </section>
  );
}
