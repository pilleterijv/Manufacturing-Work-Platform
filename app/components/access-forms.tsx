"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Field } from "./shared";
export function PublicAccessForms() {
  const [mode, setMode] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="access-forms">
      <div className="button-row">
        <button
          type="button"
          onClick={() => setMode(mode === "register" ? "" : "register")}
        >
          Request an account
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "forgot" ? "" : "forgot")}
        >
          Forgot my password
        </button>
      </div>
      {mode && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const r = await api("/api/access-requests", {
                action: mode,
                ...Object.fromEntries(f),
              });
              setNotice(r.message);
              setMode("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {mode === "register"
              ? "Request company access"
              : "Request a password reset"}
          </h3>
          {mode === "register" ? (
            <>
              <Field label="Requested username">
                <input
                  name="username"
                  required
                  pattern="[a-z0-9._\-]{3,80}"
                  maxLength={80}
                />
              </Field>
              <Field label="Your full name">
                <input name="name" required maxLength={150} />
              </Field>
              <Field label="Company email">
                <input name="email" type="email" required maxLength={254} />
              </Field>
              <Field label="Your department">
                <input name="department" required maxLength={150} />
              </Field>
              <Field label="Reason for access">
                <textarea name="reason" maxLength={1000} />
              </Field>
            </>
          ) : (
            <Field label="Username or account email">
              <input name="identity" required maxLength={254} />
            </Field>
          )}
          <button disabled={busy}>
            {mode === "register"
              ? "Submit registration request"
              : "Email password link"}
          </button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ResetPasswordForm() {
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-form">
      <h1>Set your Floorwork password</h1>
      {notice ? (
        <>
          <p role="status">{notice}</p>
          <a href="/">Return to sign in</a>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setError("Passwords must match");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const token = new URLSearchParams(location.hash.slice(1)).get(
                "reset",
              );
              const r = await api("/api/access-requests", {
                action: "reset",
                token,
                password: f.get("password"),
              });
              history.replaceState(null, "", "/");
              setNotice(r.message);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="New password">
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              name="confirm"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <button className="primary" disabled={busy}>
            Save new password
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
export function AccessRequests({ reload }: { reload: () => void }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await api("/api/access-requests"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel">
      <h2>Registration requests</h2>
      <button onClick={() => void load()}>Review registration requests</button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <p>
          {data.emailConfigured
            ? "Password invitation emails configured"
            : "SMTP is not configured. Set a temporary password in Accounts after approval."}{" "}
          Approved accounts start with no department access.
        </p>
      )}
      {data?.requests.map((r: any) => (
        <article key={r.id} className="problem-action">
          <h3>
            {r.name} · {r.status}
          </h3>
          <p>
            {r.username} · {r.email} · {r.department}
          </p>
          <p>{r.reason}</p>
          {r.status === "Pending" && (
            <div className="button-row">
              {["Approved", "Rejected"].map((decision) => (
                <button
                  key={decision}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api("/api/access-requests", {
                        id: r.id,
                        decision,
                      });
                      setNotice(
                        decision === "Approved"
                          ? `Account approved. ${result.emailSent ? "Password invitation sent." : "Email was not sent; configure SMTP or set a temporary password in Accounts."} Assign the account's departments and areas before use.`
                          : "Request rejected.",
                      );
                      await load();
                      reload();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {decision === "Approved"
                    ? "Approve request"
                    : "Reject request"}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
