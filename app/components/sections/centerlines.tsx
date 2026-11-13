"use client";
import { useEffect, useRef, useState } from "react";
import { api, filterUrl } from "@/lib/client-api";
import {
  readingResult,
  type CenterlineParameter,
} from "@/lib/centerline-rules";
import type { Evidence } from "@/lib/evidence-schema";
import EvidenceInput, { EvidenceView } from "../evidence-input";
import RefreshControl, { useSectionRefresh } from "../refresh-control";
import { Field } from "../shared";
const blankParameter = (): CenterlineParameter => ({
  id: crypto.randomUUID(),
  name: "",
  kind: "numeric",
  unit: "",
  target: null,
  lower: null,
  upper: null,
  expected: "",
  instructions: "",
  photo: false,
});
const limits = (p: CenterlineParameter) =>
  p.kind === "text"
    ? `Expected: ${p.expected}`
    : `Target ${p.target} ${p.unit} · Range ${p.lower}–${p.upper} ${p.unit}`;
export default function Centerlines() {
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [retired, setRetired] = useState(false),
    [context, setContext] = useState("");
  const [responses, setResponses] = useState<
    Record<string, { actual: string; comment: string; media: Evidence[] }>
  >({});
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const sequence = useRef(0),
    uploads = useRef(0),
    submissionId = useRef("");
  async function load(mode: "refresh" | "plans" | "history" = "refresh") {
    const seq = ++sequence.current;
    const q =
      mode === "plans" && data?.cursor
        ? `?cursor=${data.cursor}`
        : mode === "history" && data?.historyCursor
          ? `?historyCursor=${data.historyCursor}`
          : "";
    const result = await api("/api/centerlines" + q);
    if (seq !== sequence.current) return;
    setData((old: any) => ({
      ...result,
      plans:
        mode === "plans"
          ? [...old.plans, ...result.plans]
          : mode === "history"
            ? old.plans
            : result.plans,
      records:
        mode === "history"
          ? [...old.records, ...result.records]
          : mode === "plans"
            ? old.records
            : result.records,
      cursor: mode === "history" ? old.cursor : result.cursor,
      historyCursor:
        mode === "plans" ? old.historyCursor : result.historyCursor,
    }));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    return () => {
      sequence.current++;
    };
  }, []);
  useSectionRefresh(
    () => load(),
    (e) => setError(e.message),
  );
  async function save(body: any) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/centerlines", body);
      setDraft(null);
      setSelected(null);
      setNotice(
        body.action === "audit"
          ? "Centerline audit saved."
          : body.action === "retire"
            ? "Centerline retired. Audit history preserved."
            : "Centerline settings saved.",
      );
      try {
        await load();
      } catch {
        setNotice("Saved. Refresh the list before another entry.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const machine = (id: string) => {
    const e = data?.equipment.find((x: any) => x.id === id);
    return e
      ? [e.plant, e.department, e.area, e.name].filter(Boolean).join(" / ")
      : id;
  };
  const update = (id: string, patch: object) =>
    setResponses((old) => ({
      ...old,
      [id]: {
        ...(old[id] || { actual: "", comment: "", media: [] }),
        ...patch,
      },
    }));
  const parameter = (index: number, patch: object) =>
    setDraft({
      ...draft,
      parameters: draft.parameters.map((p: CenterlineParameter, i: number) =>
        i === index ? { ...p, ...patch } : p,
      ),
    });
  return (
    <>
      <section className="panel">
        <h2>Machine centerlines</h2>
        <p>
          Define machine settings for a product or setup, then audit the actual
          readings. Limits are inclusive; text settings match without regard to
          letter case.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {data?.canManage && (
          <button
            className="primary"
            disabled={busy || uploading}
            onClick={() => {
              setSelected(null);
              setDraft({
                title: "",
                equipmentId: "",
                setup: "",
                notes: "",
                parameters: [blankParameter()],
              });
              setError("");
            }}
          >
            Add centerline
          </button>
        )}
        {!data && !error && <p role="status">Loading centerlines…</p>}
      </section>
      {draft && (
        <section className="panel">
          <h2>{draft.id ? "Edit centerline" : "New centerline"}</h2>
          <p>
            Save a new revision when settings change. Existing audit readings
            keep the original limits.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ ...draft, action: "save" });
            }}
          >
            <div className="form-grid">
              <Field label="Centerline title">
                <input
                  required
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Centerline machine">
                <select
                  aria-label="Centerline machine"
                  required
                  disabled={!!draft.id}
                  value={draft.equipmentId}
                  onChange={(e) =>
                    setDraft({ ...draft, equipmentId: e.target.value })
                  }
                >
                  <option value="">Choose machine</option>
                  {data.equipment.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {machine(e.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Product / setup">
                <input
                  maxLength={150}
                  value={draft.setup}
                  onChange={(e) =>
                    setDraft({ ...draft, setup: e.target.value })
                  }
                />
              </Field>
              <Field label="Centerline instructions">
                <textarea
                  maxLength={3000}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </Field>
            </div>
            {draft.parameters.map((p: CenterlineParameter, i: number) => (
              <fieldset key={p.id} className="panel">
                <legend>Setting {i + 1}</legend>
                <div className="form-grid">
                  <Field label={`Setting name ${i + 1}`}>
                    <input
                      required
                      maxLength={150}
                      value={p.name}
                      onChange={(e) => parameter(i, { name: e.target.value })}
                    />
                  </Field>
                  <Field label={`Setting type ${i + 1}`}>
                    <select
                      aria-label={`Setting type ${i + 1}`}
                      value={p.kind}
                      onChange={(e) => parameter(i, { kind: e.target.value })}
                    >
                      <option value="numeric">Numeric range</option>
                      <option value="text">Text / position setting</option>
                    </select>
                  </Field>
                  {p.kind === "numeric" ? (
                    <>
                      {(
                        [
                          ["target", "Target"],
                          ["lower", "Lower limit"],
                          ["upper", "Upper limit"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={`${label} ${i + 1}`}>
                          <input
                            type="number"
                            step="any"
                            required
                            min={-1e12}
                            max={1e12}
                            value={p[key] ?? ""}
                            onChange={(e) =>
                              parameter(i, {
                                [key]:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                      ))}
                      <Field label={`Unit ${i + 1}`}>
                        <input
                          maxLength={40}
                          placeholder="rpm, °C, bar…"
                          value={p.unit}
                          onChange={(e) =>
                            parameter(i, { unit: e.target.value })
                          }
                        />
                      </Field>
                    </>
                  ) : (
                    <Field label={`Expected setting ${i + 1}`}>
                      <input
                        required
                        maxLength={150}
                        placeholder="e.g. Closed or Position A"
                        value={p.expected}
                        onChange={(e) =>
                          parameter(i, { expected: e.target.value })
                        }
                      />
                    </Field>
                  )}
                  <Field label={`Check instructions ${i + 1}`}>
                    <textarea
                      maxLength={1000}
                      value={p.instructions}
                      onChange={(e) =>
                        parameter(i, { instructions: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={p.photo}
                    onChange={(e) => parameter(i, { photo: e.target.checked })}
                  />
                  Require photo or video for setting {i + 1}
                </label>
                <button
                  type="button"
                  className="outline"
                  disabled={draft.parameters.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      parameters: draft.parameters.filter(
                        (_: any, n: number) => n !== i,
                      ),
                    })
                  }
                >
                  Remove setting {i + 1}
                </button>
              </fieldset>
            ))}
            <div className="button-row">
              <button
                type="button"
                className="outline"
                disabled={draft.parameters.length >= 100}
                onClick={() =>
                  setDraft({
                    ...draft,
                    parameters: [...draft.parameters, blankParameter()],
                  })
                }
              >
                Add setting
              </button>
              <button className="primary" disabled={busy}>
                Save centerline
              </button>
              <button
                type="button"
                className="outline"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancel settings
              </button>
            </div>
          </form>
        </section>
      )}
      {data && (
        <section className="panel">
          <h2>Centerline settings</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={retired}
              onChange={(e) => setRetired(e.target.checked)}
            />
            Show retired centerlines
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Centerline / setup</th>
                  <th>Machine</th>
                  <th>Revision</th>
                  <th>Settings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.plans
                  .filter((c: any) => c.active || retired)
                  .map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        {c.title}
                        <br />
                        <small>
                          {c.setup || "All setups"}
                          {!c.active && " · Retired"}
                        </small>
                      </td>
                      <td>{machine(c.equipmentId)}</td>
                      <td>{c.version}</td>
                      <td>
                        <details>
                          <summary>{c.parameters.length} settings</summary>
                          {c.parameters.map((p: CenterlineParameter) => (
                            <p key={p.id}>
                              <strong>{p.name}</strong> · {limits(p)}
                              <br />
                              {p.instructions}
                            </p>
                          ))}
                          {c.notes && <p>{c.notes}</p>}
                          <details>
                            <summary>Revision log</summary>
                            {c.history.map((h: any, i: number) => (
                              <p key={i}>
                                Revision {h.version} · {h.action} · {h.name} ·{" "}
                                {new Date(h.at).toLocaleString()}
                              </p>
                            ))}
                          </details>
                        </details>
                      </td>
                      <td>
                        <div className="button-row">
                          {c.active && (
                            <button
                              className="primary"
                              disabled={busy || uploading}
                              onClick={() => {
                                setDraft(null);
                                setSelected(c);
                                setResponses({});
                                setContext("");
                                submissionId.current = crypto.randomUUID();
                                setError("");
                                setNotice("");
                              }}
                            >
                              Audit centerline
                            </button>
                          )}
                          {c.active && data.canManage && (
                            <>
                              <button
                                className="outline"
                                disabled={busy || uploading}
                                onClick={() => {
                                  setSelected(null);
                                  setDraft(structuredClone(c));
                                }}
                              >
                                Edit settings
                              </button>
                              <button
                                className="outline"
                                disabled={busy || uploading}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Retire ${c.title}? Completed audits and evidence will remain available.`,
                                    )
                                  )
                                    void save({
                                      action: "retire",
                                      id: c.id,
                                      version: c.version,
                                    });
                                }}
                              >
                                Retire centerline
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data.plans.some((c: any) => c.active || retired) && (
            <p>
              No matching centerlines. A manager can add settings for a
              permitted machine.
            </p>
          )}
          {data.cursor && (
            <button
              className="outline"
              disabled={busy}
              onClick={() =>
                void load("plans").catch((e) => setError(e.message))
              }
            >
              Load more centerlines
            </button>
          )}
        </section>
      )}
      {selected && (
        <section className="panel">
          <h2>Audit: {selected.title}</h2>
          <p>
            {machine(selected.equipmentId)} · Revision {selected.version} ·{" "}
            {selected.setup || "All setups"}
          </p>
          <p>{selected.notes}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({
                action: "audit",
                id: selected.id,
                version: selected.version,
                submissionId: submissionId.current,
                context,
                responses: selected.parameters.map(
                  (p: CenterlineParameter) => ({
                    parameterId: p.id,
                    ...(responses[p.id] || {
                      actual: "",
                      comment: "",
                      media: [],
                    }),
                  }),
                ),
              });
            }}
          >
            <Field label="Shift / batch / order (optional)">
              <input
                maxLength={150}
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </Field>
            {selected.parameters.map((p: CenterlineParameter) => {
              const r = responses[p.id] || {
                actual: "",
                comment: "",
                media: [],
              };
              let result: { withinLimits: boolean } | null = null;
              try {
                if (r.actual.trim()) result = readingResult(p, r.actual);
              } catch {}
              return (
                <fieldset className="panel" key={p.id}>
                  <legend>{p.name}</legend>
                  <p>{limits(p)}</p>
                  <p>{p.instructions}</p>
                  <Field label={`Actual reading · ${p.name}`}>
                    <input
                      required
                      type={p.kind === "numeric" ? "number" : "text"}
                      step="any"
                      min={p.kind === "numeric" ? -1e12 : undefined}
                      max={p.kind === "numeric" ? 1e12 : undefined}
                      maxLength={150}
                      value={r.actual}
                      onChange={(e) => update(p.id, { actual: e.target.value })}
                    />
                  </Field>
                  {result && (
                    <p
                      role="status"
                      className={result.withinLimits ? "notice" : "error"}
                    >
                      {result.withinLimits
                        ? "Within limits"
                        : "Out of limits — follow up required"}
                    </p>
                  )}
                  <Field label={`Comment / action taken · ${p.name}`}>
                    <textarea
                      required={result?.withinLimits === false}
                      maxLength={1000}
                      value={r.comment}
                      onChange={(e) =>
                        update(p.id, { comment: e.target.value })
                      }
                    />
                  </Field>
                  <EvidenceInput
                    label={`Evidence · ${p.name}${p.photo ? " (required)" : " (optional)"}`}
                    value={r.media}
                    onChange={(media) => update(p.id, { media })}
                    onBusy={(v) => {
                      uploads.current += v ? 1 : -1;
                      setUploading(uploads.current > 0);
                    }}
                  />
                </fieldset>
              );
            })}
            <div className="button-row">
              <button className="primary" disabled={busy || uploading}>
                Save centerline audit
              </button>
              <button
                type="button"
                className="outline"
                disabled={busy || uploading}
                onClick={() => setSelected(null)}
              >
                Cancel audit
              </button>
            </div>
          </form>
        </section>
      )}
      {data && (
        <section className="panel">
          <h2>Centerline audit history</h2>
          <RefreshControl onRefresh={() => load()} />
          <p>
            {data.summary.total} matching audits · {data.summary.followUps} with
            out-of-limit readings. Original settings and readings are preserved.
          </p>
          {!data.records.length && (
            <p>No audits recorded for the current filters.</p>
          )}
          {data.records.map((r: any) => {
            const d = r.data;
            return (
              <details key={r.id} className="panel">
                <summary>
                  {d.title} · {new Date(r.created).toLocaleString()} ·{" "}
                  {r.user.name} · {d.followUp ? "Follow up" : "Within limits"}
                </summary>
                <p>
                  {d.equipmentSnapshot.name} · {d.centerlineSnapshot.setup} ·
                  Revision {d.centerlineSnapshot.version} · {d.context}
                </p>
                <p>{d.centerlineSnapshot.notes}</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Setting</th>
                        <th>Approved limits</th>
                        <th>Actual</th>
                        <th>Result</th>
                        <th>Notes / evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.responses.map((a: any) => {
                        const p = d.centerlineSnapshot.parameters.find(
                          (x: CenterlineParameter) => x.id === a.parameterId,
                        );
                        return (
                          <tr key={a.parameterId}>
                            <td>
                              {p.name}
                              <br />
                              <small>{p.instructions}</small>
                            </td>
                            <td>{limits(p)}</td>
                            <td>
                              {a.actual} {p.unit}
                            </td>
                            <td>
                              {a.withinLimits
                                ? "Within limits"
                                : "Out of limits"}
                            </td>
                            <td>
                              {a.comment}
                              <EvidenceView media={a.media} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
          {data.historyCursor && (
            <button
              className="outline"
              disabled={busy}
              onClick={() =>
                void load("history").catch((e) => setError(e.message))
              }
            >
              Load older audits
            </button>
          )}
        </section>
      )}
    </>
  );
}
