"use client";
import { useEffect, useState } from "react";
import { api, filterUrl } from "@/lib/client-api";
import EvidenceInput, { EvidenceView } from "../evidence-input";
import { Field } from "../shared";
import PersonSelect from "../person-select";
export default function Defects({
  userId,
  admin,
}: {
  userId: string;
  admin: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [media, setMedia] = useState<any[]>([]),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mapping, setMapping] = useState<Record<string, number>>({});
  async function load(more = false) {
    const d = await api(
      "/api/defects" + (more ? "?cursor=" + data.cursor : ""),
    );
    setData((old: any) =>
      more ? { ...d, defects: [...old.defects, ...d.defects] } : d,
    );
    setMapping(d.assets);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function save(body: any) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/defects", body);
      await load();
      setNotice("Defect saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const machine = (id: string) => {
    const e = data?.equipment.find((e: any) => e.id === id);
    return e ? [e.plant, e.department, e.area, e.name].join(" / ") : id;
  };
  return (
    <>
      <section className="panel">
        <h2>Report a machine defect</h2>
        <p>
          Record abnormalities and evidence. Local resolution and MaintainX
          submission are tracked separately.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            if (
              await save({
                action: "report",
                ...Object.fromEntries(new FormData(form)),
                media,
              })
            ) {
              form.reset();
              setMedia([]);
            }
          }}
        >
          <Field label="Defect machine">
            <select name="equipmentId" required>
              <option value="">Choose machine</option>
              {data?.equipment.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {machine(e.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Defect title">
            <input name="title" required maxLength={150} />
          </Field>
          <Field label="Defect description">
            <textarea name="description" required maxLength={10000} />
          </Field>
          <Field label="Priority">
            <select name="priority" defaultValue="Medium">
              {["Low", "Medium", "High", "Critical"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <EvidenceInput
            label="Defect photos or videos"
            value={media}
            onChange={setMedia}
            onBusy={setUploading}
          />
          <button className="primary" disabled={busy || uploading}>
            Report defect
          </button>
        </form>
      </section>
      {admin && data && (
        <section className="panel">
          <h2>MaintainX asset mapping</h2>
          <p>
            {data.maintainxConfigured
              ? "Server API key configured"
              : "IT must configure MAINTAINX_API_KEY on the server"}
            . Photos and videos remain private in Floorwork; the work order
            contains the defect description and reference.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save({ action: "mapping", assets: mapping });
            }}
          >
            {data.equipment.map((e: any) => (
              <Field key={e.id} label={machine(e.id)}>
                <input
                  aria-label={`MaintainX asset for ${e.name}`}
                  type="number"
                  min={1}
                  step={1}
                  value={mapping[e.id] ?? ""}
                  onChange={(v) =>
                    setMapping((old) => {
                      const n = { ...old };
                      if (v.target.value) n[e.id] = Number(v.target.value);
                      else delete n[e.id];
                      return n;
                    })
                  }
                />
              </Field>
            ))}
            <button className="outline" disabled={busy}>
              Save MaintainX mapping
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Defect register</h2>
        <a className="outline" href={filterUrl("/api/defects?format=xlsx")}>
          Export defects
        </a>
        {data?.defects.map((d: any) => (
          <article className="problem-action" key={d.id}>
            <h3>
              {d.title}{" "}
              <span className={"badge " + (d.status === "Open" ? "warn" : "")}>
                {d.priority} · {d.status}
              </span>
            </h3>
            <p>{machine(d.equipmentId)}</p>
            <p>{d.description}</p>
            <p>
              Reported by{" "}
              {data.people.find((p: any) => p.id === d.reportedBy)?.name ??
                d.reportedBy}{" "}
              · {new Date(d.createdAt).toLocaleString()}
            </p>
            <EvidenceView media={d.media} />
            <p>
              MaintainX: {d.maintainxStatus}
              {d.maintainxId ? ` · Work order ${d.maintainxId}` : ""}
            </p>
            {d.submissionError && <p role="status">{d.submissionError}</p>}
            {(data.canManage ||
              d.reportedBy === userId ||
              d.assigneeId === userId) && (
              <>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save({
                      action: "update",
                      id: d.id,
                      version: d.version,
                      status: f.get("status"),
                      assigneeId: data.canManage
                        ? f.get("assigneeId") || null
                        : d.assigneeId,
                      comment: f.get("comment"),
                    });
                  }}
                >
                  <Field label="Defect status">
                    <select name="status" defaultValue={d.status}>
                      <option>Open</option>
                      <option>Resolved</option>
                    </select>
                  </Field>
                  {data.canManage && (
                    <Field label="Defect assignee">
                      <PersonSelect
                        name="assigneeId"
                        people={data.people}
                        defaultValue={d.assigneeId ?? ""}
                      />
                    </Field>
                  )}
                  <Field label="Update comment">
                    <input name="comment" maxLength={2000} />
                  </Field>
                  <button className="outline" disabled={busy}>
                    Update defect
                  </button>
                </form>
                {d.status === "Open" &&
                  d.maintainxStatus === "Not submitted" && (
                    <button
                      className="outline"
                      disabled={
                        busy ||
                        !data.maintainxConfigured ||
                        !data.assets[d.equipmentId]
                      }
                      onClick={() => void save({ action: "submit", id: d.id })}
                    >
                      Submit work order to MaintainX
                    </button>
                  )}
              </>
            )}
            {admin &&
              ["Sending", "Review required"].includes(d.maintainxStatus) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save({
                      action: "reconcile",
                      id: d.id,
                      workOrderId: f.get("workOrderId") || null,
                      confirmedAbsent: f.get("confirmedAbsent") === "on",
                    });
                  }}
                >
                  <Field label="Existing MaintainX work order ID">
                    <input name="workOrderId" pattern="[0-9]+" />
                  </Field>
                  <label className="check">
                    <input type="checkbox" name="confirmedAbsent" />I checked
                    MaintainX and no work order exists for this defect
                  </label>
                  <button className="outline" disabled={busy}>
                    Reconcile MaintainX submission
                  </button>
                </form>
              )}
            <details>
              <summary>Defect change history</summary>
              {d.history.map((h: any, i: number) => (
                <p key={i}>
                  {h.at} · {h.name} · {h.event ?? h.status} {h.comment}
                </p>
              ))}
            </details>
          </article>
        ))}
        {data && !data.defects.length && <p>No defects match these filters.</p>}
        {data?.hasMore && (
          <button
            className="outline"
            disabled={busy}
            onClick={() => load(true).catch((e) => setError(e.message))}
          >
            Load more defects
          </button>
        )}
      </section>
    </>
  );
}
