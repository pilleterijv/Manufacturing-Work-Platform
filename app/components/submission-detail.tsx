"use client";
import { useState } from "react";
import { EvidenceView } from "./evidence-input";
import type { Evidence } from "@/lib/evidence-schema";
const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
function FieldValue({ value }: { value: any }) {
  if (value === null || value === undefined || value === "")
    return <span className="muted">Not recorded</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) return <ArrayValue value={value} />;
  if (typeof value === "object")
    return (
      <dl className="submission-fields">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{label(k)}</dt>
            <dd>
              <FieldValue value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span className="guide-body">{String(value)}</span>;
}
function ArrayValue({ value }: { value: any[] }) {
  const [count, setCount] = useState(50);
  return (
    <div>
      {value.slice(0, count).map((v, i) => (
        <div key={i}>
          <FieldValue value={v} />
        </div>
      ))}
      {value.length > count && (
        <button
          type="button"
          className="outline"
          onClick={() => setCount((n) => n + 50)}
        >
          Show next 50 items ({value.length - count} remaining)
        </button>
      )}
    </div>
  );
}
function media(raw: any): Evidence[] {
  return Array.isArray(raw)
    ? raw
        .filter(
          (m) =>
            m &&
            typeof m.id === "string" &&
            ["photo", "video"].includes(m.kind),
        )
        .map((m) => ({ ...m, caption: m.caption || "" }))
    : [];
}
export default function SubmissionDetail({
  data,
  onClose,
}: {
  data: any;
  onClose: () => void;
}) {
  const r = data.record,
    d = data.source === "record" ? r.data : r,
    snapshot = d.snapshot || d.planSnapshot || d.centerlineSnapshot || {},
    steps = snapshot.steps || snapshot.questions || snapshot.parameters || [];
  const title = snapshot.title || d.title || "Submitted work";
  const originalEquipment = snapshot.equipment || d.equipmentSnapshot;
  const attachedIds = new Set(
    (d.responses || []).flatMap((a: any) =>
      [...media(a.media).map((m) => m.id), a.photo, a.video].filter(Boolean),
    ),
  );
  return (
    <section className="panel" aria-label="Submission details">
      <div className="section-title">
        <h2>{title}</h2>
        <button type="button" className="outline" onClick={onClose}>
          Close submission
        </button>
      </div>
      <p className="badge">Read-only saved submission</p>
      <p>
        Reference: <code>{r.id}</code> ·{" "}
        {new Date(r.created || r.createdAt).toLocaleString()} ·{" "}
        {r.user?.name || data.authorName || "Recorded account"}
      </p>
      {data.areas?.[0] && (
        <p>
          {[
            data.areas[0].plant,
            data.areas[0].department,
            data.areas[0].area,
            data.areas[0].line,
          ]
            .filter(Boolean)
            .join(" / ")}
          {!data.areas[0].active ? " · Retired location — history only" : ""}
        </p>
      )}
      <dl className="submission-fields">
        {Object.entries(d)
          .filter(
            ([k]) =>
              ![
                "snapshot",
                "planSnapshot",
                "equipmentSnapshot",
                "responses",
                "cycles",
                "media",
                "handoff",
                "id",
                "planId",
                "standardId",
                "userId",
                "createdAt",
              ].includes(k),
          )
          .map(([k, v]) => (
            <div key={k}>
              <dt>{label(k)}</dt>
              <dd>
                <FieldValue value={v} />
              </dd>
            </div>
          ))}
      </dl>
      {snapshot.revision && (
        <p>Original checklist revision: {snapshot.revision}</p>
      )}
      {originalEquipment && (
        <p>
          {[
            originalEquipment.plant,
            originalEquipment.department,
            originalEquipment.area,
            originalEquipment.line,
            originalEquipment.name,
          ]
            .filter(Boolean)
            .join(" / ")}
        </p>
      )}
      {!snapshot.revision && snapshot.version && (
        <p>Original plan version: {snapshot.version}</p>
      )}
      {d.handoff && (
        <section>
          <h3>Shift handoff</h3>
          <FieldValue value={d.handoff} />
        </section>
      )}
      {Array.isArray(d.responses) && (
        <section>
          <h3>Submitted answers</h3>
          {d.responses.map((a: any, i: number) => {
            const s = steps.find(
              (s: any) => s.id === (a.stepId || a.questionId || a.parameterId),
            );
            const evidence = [
              ...media(a.media),
              ...(a.photo
                ? [
                    {
                      id: a.photo,
                      kind: "photo" as const,
                      caption: "Submitted photo",
                    },
                  ]
                : []),
              ...(a.video
                ? [
                    {
                      id: a.video,
                      kind: "video" as const,
                      caption: "Submitted video",
                    },
                  ]
                : []),
            ];
            return (
              <article
                className="record-step"
                key={a.stepId || a.questionId || a.parameterId || i}
              >
                <h4>{s?.text || s?.name || `Response ${i + 1}`}</h4>
                {s?.group && (
                  <p>
                    {s.group}
                    {s.timing ? ` · ${s.timing}` : ""}
                  </p>
                )}
                <FieldValue
                  value={Object.fromEntries(
                    Object.entries(a).filter(
                      ([k]) =>
                        ![
                          "photo",
                          "video",
                          "media",
                          "stepId",
                          "parameterId",
                          "questionId",
                        ].includes(k),
                    ),
                  )}
                />
                {s?.unit && (
                  <p>
                    Unit: {s.unit} · Original target:{" "}
                    {s.target ?? s.expected ?? "Not recorded"} · Limits:{" "}
                    {s.lower ?? "—"} to {s.upper ?? "—"}
                  </p>
                )}
                <EvidenceView media={evidence} />
              </article>
            );
          })}
        </section>
      )}
      {Array.isArray(d.cycles) && (
        <section>
          <h3>Time observations</h3>
          <FieldValue value={d.cycles} />
        </section>
      )}
      <EvidenceView
        media={media(d.media).filter((m) => !attachedIds.has(m.id))}
      />
      <p className="small muted">
        Viewing this entry does not change it. Use the original section for a
        new submission or an authorized status update.
      </p>
    </section>
  );
}
