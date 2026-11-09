"use client";
import { useState, useEffect } from "react";
import { api, filterUrl } from "@/lib/client-api";
export default function ExternalData({
  section,
  admin,
  canImport,
  canExport,
}: {
  section: string;
  admin: boolean;
  canImport: boolean;
  canExport: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  async function load(more = false) {
    const d = await api(
      "/api/external-data?" +
        new URLSearchParams({
          section,
          ...(more ? { cursor: data?.cursor ?? "" } : {}),
        }),
    );
    setData((old: any) =>
      more ? { ...d, items: [...old.items, ...d.items] } : d,
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [section]);
  return (
    <section className="panel">
      <h2>Connected data · {section}</h2>
      {canExport && (
        <a
          className="outline"
          href={filterUrl(
            "/api/external-data?" +
              new URLSearchParams({ section, format: "xlsx" }),
          )}
        >
          Export connected results
        </a>
      )}
      <p className="small muted">
        Read-only source records, scoped to your departments and areas.
        Importing does not overwrite app checklists, actions or completion
        history.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data?.feeds.map((f: any) => (
        <div className="problem-action" key={f.id}>
          <strong>{f.name}</strong>
          <p className="small">
            Feed ID {f.id} · {f.mode} ·{" "}
            {f.lastImportedAt
              ? "last imported " + new Date(f.lastImportedAt).toLocaleString()
              : "Awaiting first import"}
          </p>
          {f.lastError && <p role="alert">{f.lastError}</p>}
          {f.mode === "excel" && canImport && (
            <label className="field">
              <span>Import Excel production results into {f.name}</span>
              <input
                type="file"
                accept=".xlsx"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    if (file.size > 8 * 1024 * 1024)
                      throw Error("Workbook must be under 8 MB");
                    const workbook = await new Promise<string>(
                      (resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result));
                        r.onerror = () =>
                          reject(Error("Could not read workbook"));
                        r.readAsDataURL(file);
                      },
                    );
                    const r = await api("/api/external-data/import", {
                      feedId: f.id,
                      workbook,
                    });
                    await load();
                    setNotice(`${r.imported} production rows imported.`);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <a href="/api/external-data/template">
                Download Excel template and machine IDs
              </a>
            </label>
          )}
        </div>
      ))}
      {admin && (
        <>
          <button className="outline" onClick={() => setShow(!show)}>
            Configure external data feed
          </button>
          {show && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = Object.fromEntries(new FormData(form));
                setBusy(true);
                try {
                  await api("/api/external-data", {
                    action: "create",
                    section,
                    ...f,
                  });
                  await load();
                  form.reset();
                  setShow(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                <span>Feed name</span>
                <input name="name" maxLength={150} required />
              </label>
              <label className="field">
                <span>Integration source</span>
                <select name="sourceId" required>
                  <option value="">
                    Create a source in Integrations, then select it
                  </option>
                  {data?.sources?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Connection mode</span>
                <select name="mode">
                  <option value="excel">Excel production results</option>
                  <option value="api">Read-only database / API feed</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Create external feed
              </button>
            </form>
          )}
        </>
      )}
      {data?.items.map((r: any) => (
        <details key={r.id}>
          <summary>
            {r.title} ·{" "}
            {data.equipment?.find((e: any) => e.id === r.equipmentId)?.name ??
              r.equipmentId}{" "}
            ·{" "}
            <time
              dateTime={
                typeof r.values.productionDate === "string"
                  ? r.values.productionDate
                  : r.occurredAt
              }
            >
              {typeof r.values.productionDate === "string"
                ? r.values.productionDate
                : new Date(r.occurredAt).toLocaleDateString()}
            </time>
          </summary>
          <p>{r.details}</p>
          <p className="small">
            {data.feeds.find((f: any) => f.id === r.feedId)?.name} · external ID{" "}
            {r.externalId} ·{" "}
            {(() => {
              const e = data.equipment?.find(
                (e: any) => e.id === r.equipmentId,
              );
              return e
                ? [e.plant, e.department, e.area, e.line]
                    .filter(Boolean)
                    .join(" / ")
                : "";
            })()}{" "}
            · machine ID {r.equipmentId}
          </p>
          <dl>
            {Object.entries(r.values).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v ?? "")}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      {data && !data.items.length && (
        <p className="muted">No imported records match the current filters.</p>
      )}
      {data?.hasMore && (
        <button onClick={() => load(true).catch((e) => setError(e.message))}>
          Load more connected records
        </button>
      )}
    </section>
  );
}
