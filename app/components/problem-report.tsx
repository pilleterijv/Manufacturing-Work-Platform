"use client";
import { methodology, defaultRequirements, type Method } from "@/lib/problem-rules";
import { EvidenceView } from "./evidence-input";
export default function ProblemReport({
  record: r,
  people,
  edit,
  close,
  machineHistory,
}: {
  record: any;
  people: { id: string; name: string }[];
  edit: () => void;
  close: () => void;
  machineHistory: () => void;
}) {
  const person = (id: string) => people.find((p) => p.id === id)?.name || "Previously assigned account";
  const requirements = r.requirements ?? defaultRequirements(r.method as Method);
  return (
    <article className="panel problem-report" aria-label="Problem-solving report">
      <header className="section-title">
        <div>
          <p className="eyebrow">
            {r.method} problem solving · {r.reference}
          </p>
          <h2>{r.title}</h2>
          <span className="badge">{r.status}</span>
        </div>
        <div className="button-row">
          <button type="button" onClick={machineHistory}>
            History for this machine
          </button>
          {r.permissions.editCase && (
            <button type="button" className="primary" onClick={edit}>
              Edit record
            </button>
          )}
          <button type="button" onClick={close}>
            Close report
          </button>
        </div>
      </header>
      <p>
        {r.permissions.editCase
          ? "You are assigned to this case. Use Edit record to make permitted updates."
          : "Read-only: you can review this case within your assigned location, but you are not assigned to edit it."}
      </p>
      <dl className="problem-report-meta">
        {[
          ["Machine", r.equipmentSnapshot.name],
          ["Department / area", `${r.equipmentSnapshot.department} / ${r.equipmentSnapshot.area}`],
          ["Occurred", r.occurredOn],
          ["Due", r.dueDate],
          ["Reported by", r.reportedBy],
          ["Facilitator", person(r.ownerId)],
          ["Reviewer", person(r.reviewerId)],
          [
            "Assigned participants",
            (r.participantIds || []).map(person).join(", ") || "No additional participants selected",
          ],
          ["Team notes (descriptive)", r.team || "Not recorded"],
          ["Closed", r.closedAt ? new Date(r.closedAt).toLocaleString() : "Not closed"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      {methodology[r.method as Method].sections
        .filter(
          (s) => s.title !== "Second root cause path (optional)" || r.answers.secondRootCauseEnabled === "Yes"
        )
        .map((section) => (
          <section className="problem-report-section" key={section.title}>
            <h3>{section.title}</h3>
            <dl>
              {section.fields.map(([key, label]) => (
                <div key={key}>
                  <dt>
                    {label}
                    {requirements.fields.includes(key) ? " · required" : ""}
                  </dt>
                  <dd>{r.answers[key]?.trim() || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      <EvidenceView media={r.media || []} />
      <section className="problem-report-section">
        <h3>Actions and results</h3>
        {r.actions.map((a: any) => (
          <article className="problem-action" key={a.id}>
            <h4>
              {a.type} · {a.title}
            </h4>
            <p>
              <span className="badge">{a.status}</span> · {person(a.ownerId)} · Due {a.dueDate} ·{" "}
              {a.required ? "Required" : "Optional"}
            </p>
            {a.checkpoint && <p>Checkpoint: {a.checkpoint}</p>}
            {a.completedAt && <p>Completed {new Date(a.completedAt).toLocaleString()}</p>}
            <p>{a.comment || "No result recorded yet"}</p>
            <EvidenceView media={a.media || []} />
          </article>
        ))}
        {!r.actions.length && <p>No actions recorded.</p>}
      </section>
      <details>
        <summary>Change history</summary>
        {r.history.map((h: any, i: number) => (
          <p key={i}>
            {h.at} · {h.name || "Demo setup"} · {h.event || h.action} {h.status || ""}
          </p>
        ))}
      </details>
    </article>
  );
}
