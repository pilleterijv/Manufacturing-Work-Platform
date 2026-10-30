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
export default function Overview({
  data,
  go,
  grants,
}: {
  data: Data;
  go: (s: string) => void;
  grants: Capability[];
}) {
  const runs = data.records.filter((r) => r.kind === "run"),
    audits = data.records.filter((r) => r.kind === "audit");
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">CONSISTENCY BUILDS CONFIDENCE</span>
          <h2>
            Make every shift
            <br />a step forward.
          </h2>
          <p>
            Your standards, evidence, and process insights.
            <br />
            One place to keep the floor moving.
          </p>
          {grants.includes("work") && (
            <button className="cream" onClick={() => go("Standard work")}>
              Start standard work <span>→</span>
            </button>
          )}
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit" />
          <div className="art-card">
            <span>PROCESS CHECK</span>
            <b>✓</b>
            <div>Ready for the next step</div>
            <i />
            <i />
            <i />
          </div>
          <div className="art-label">SMALL STEPS. BETTER SYSTEMS.</div>
        </div>
      </div>
      <div className="metrics">
        <Metric
          label="Completed work"
          value={data.overview?.runs ?? runs.length}
          detail="Stored verification records"
        />
        <Metric
          label="Time studies"
          value={
            data.overview?.studies ??
            data.records.filter((r) => r.kind === "study").length
          }
          detail="Raw observations preserved"
        />
        <Metric
          label="Supervisor audits"
          value={data.overview?.audits ?? audits.length}
          detail="Timed process checks"
        />
        <Metric
          label="Follow-ups"
          value={
            data.overview?.followUps ??
            data.records.filter((r) => r.data.followUp).length
          }
          detail="Failures or cycles over target"
          accent
        />
      </div>
      <div className="section-title">
        <h2>Your floor, at a glance</h2>
        <span className="muted">Latest activity</span>
      </div>
      <History data={data} records={data.records.slice(0, 8)} />
    </>
  );
}
