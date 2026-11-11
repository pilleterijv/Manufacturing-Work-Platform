"use client";
import { useSectionRefresh } from "../refresh-control";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Field } from "../shared";
export default function Integrations() {
  const [data, setData] = useState<any>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await api("/api/integrations"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useSectionRefresh(
    () => load(),
    (e) => setError(e.message),
  );
  useEffect(() => {
    void load();
  }, []);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/integrations", body);
      if (r.token) setToken(r.token);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="idea-intro">
        <span className="eyebrow">CONNECT YOUR FACTORY</span>
        <h2>Machine events, captured at their source.</h2>
        <p>
          Map external machines to Floorwork equipment. Receive down/running
          transitions from a TrakSYS adapter or import an approved Microsoft SQL
          Server view.
        </p>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {token && (
        <section className="panel">
          <h2>Save this integration key privately</h2>
          <p>
            This key is shown only now. Store it in the sending system’s secret
            settings; it will not be returned by the source list.
          </p>
          <textarea aria-label="New integration key" readOnly value={token} />
          <button className="outline" onClick={() => setToken("")}>
            Hide key
          </button>
        </section>
      )}
      {!data ? (
        <p>Loading integrations…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Microsoft SQL / Azure SQL connection</h2>
            <p>
              {data.sql.configured
                ? "Private SQL connection settings are present. Live connectivity still depends on the worker, network permissions, view and login."
                : "Not connected. IT must configure the private SQL settings and approved event view."}
            </p>
            {data.sql.health && (
              <p>
                Last poll:{" "}
                {new Date(data.sql.health.checkedAt).toLocaleString()} ·{" "}
                {data.sql.health.ok ? "Successful" : "Needs attention"} ·{" "}
                {data.sql.health.processed} events.
              </p>
            )}
            <p className="small muted">
              SQL access uses an encrypted connection and a fixed SELECT against
              an approved view. The app does not write into your company’s SQL
              database. A webhook sender can instead POST transitions to
              /api/integrations/events using its Bearer key.
            </p>
          </section>
          <section className="panel">
            <h2>Add integration source</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (
                  await save({
                    action: "createSource",
                    name: new FormData(form).get("name"),
                  })
                )
                  form.reset();
              }}
            >
              <Field label="Source name">
                <input
                  required
                  name="name"
                  maxLength={100}
                  placeholder="e.g. TrakSYS production site"
                />
              </Field>
              <button className="primary" disabled={busy}>
                Create source & key
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Sources & connection status</h2>
            {data.sources.map((s: any) => (
              <article className="problem-action" key={s.id}>
                <h3>{s.name}</h3>
                <p className="idea-id">Source ID: {s.id}</p>
                <p className="small">
                  {s.active ? "Enabled" : "Disabled"} · last received:{" "}
                  {s.lastReceivedAt
                    ? new Date(s.lastReceivedAt).toLocaleString()
                    : "No events yet"}{" "}
                  · SQL cursor: {s.sqlCursor}
                </p>
                {s.lastError && <p className="error">{s.lastError}</p>}
                <div className="button-row">
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={() =>
                      void save({
                        action: "sourceState",
                        id: s.id,
                        active: !s.active,
                      })
                    }
                  >
                    {s.active ? "Disable source" : "Enable source"}
                  </button>
                  <button
                    className="outline"
                    disabled={busy}
                    onClick={() => void save({ action: "rotateKey", id: s.id })}
                  >
                    Replace integration key
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section className="panel">
            <h2>Map a machine</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (
                  await save({
                    action: "bind",
                    ...Object.fromEntries(new FormData(form)),
                  })
                )
                  form.reset();
              }}
            >
              <div className="form-grid">
                <Field label="Integration source">
                  <select name="id" required>
                    <option value="">Choose source</option>
                    {data.sources.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="External machine ID">
                  <input name="externalId" required maxLength={150} />
                </Field>
                <Field label="Floorwork machine">
                  <select required name="equipmentId">
                    <option value="">Choose machine</option>
                    {data.equipment.map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.plant} / {e.department} / {e.area}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Automatic downtime reason">
                  <select required name="reasonId">
                    <option value="">Choose reason</option>
                    {data.reasons.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className="primary" disabled={busy}>
                Save machine mapping
              </button>
            </form>
          </section>
          <section className="panel table-wrap">
            <h2>Mapped machines</h2>
            <table>
              <thead>
                <tr>
                  <th>Source / external ID</th>
                  <th>Machine</th>
                  <th>Last state</th>
                  <th>Enable</th>
                </tr>
              </thead>
              <tbody>
                {data.bindings.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      {data.sources.find((s: any) => s.id === b.sourceId)?.name}
                      <small>{b.externalId}</small>
                    </td>
                    <td>
                      {
                        data.equipment.find((e: any) => e.id === b.equipmentId)
                          ?.name
                      }
                    </td>
                    <td>
                      {b.lastState ?? "Awaiting first event"}
                      <small>
                        {b.lastAt ? new Date(b.lastAt).toLocaleString() : ""}
                      </small>
                    </td>
                    <td>
                      <button
                        className="outline"
                        disabled={busy}
                        onClick={() =>
                          void save({
                            action: "bindingState",
                            id: b.id,
                            active: !b.active,
                          })
                        }
                      >
                        {b.active ? "Disable mapping" : "Enable mapping"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
