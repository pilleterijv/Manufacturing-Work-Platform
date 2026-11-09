"use client";
import { useState, useEffect } from "react";
import { api, getSectionFilters } from "@/lib/client-api";
export default function Reminders({ admin }: { admin: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await api("/api/reminders"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function save(b: any) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/reminders", b);
      await load();
      setNotice(
        b.action === "send"
          ? `${r.queued} reminder deliveries queued. Daily duplicates are skipped.`
          : "Notification preferences saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Overdue work reminders</h2>
      <p>
        Daily reminders go to the pilot/validator, problem facilitator/reviewer,
        action owner or PM assignee, and managers assigned to that machine’s
        department/area. Email requires an approved SMTP relay.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <fieldset>
            <legend>My overdue notifications</legend>
            {["inApp", "email"].map((key) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={data.personal[key]}
                  disabled={busy}
                  onChange={(e) =>
                    save({
                      action: "preferences",
                      ...data.personal,
                      [key]: e.target.checked,
                    })
                  }
                />
                {key === "inApp" ? "In-app messages" : "Email"}
              </label>
            ))}
          </fieldset>
          {admin && (
            <fieldset>
              <legend>Company overdue notification channels</legend>
              {["inApp", "email"].map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={data.channels[key]}
                    disabled={busy}
                    onChange={(e) =>
                      save({
                        action: "channels",
                        ...data.channels,
                        [key]: e.target.checked,
                      })
                    }
                  />
                  {key === "inApp" ? "In-app messages" : "Email"}
                </label>
              ))}
            </fieldset>
          )}
          {data.canSend && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                save({
                  action: "send",
                  person: getSectionFilters().person || undefined,
                })
              }
            >
              Send overdue reminders for my filtered department scope
            </button>
          )}
          <p className="small muted">
            Automatic checks run on the server even when browsers are closed.
            Turning off a channel also cancels unsent deliveries when the worker
            checks them.
          </p>
          <h3>Recent reminder deliveries</h3>
          {data.items.map((r: any) => (
            <details key={r.id}>
              <summary>
                {r.subject} · {r.status}
              </summary>
              <p>{r.message}</p>
              <p className="small">
                Recipient ID {r.userId} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </p>
              {r.lastError && <p>{r.lastError}</p>}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
