"use client";
import { useEffect, useState } from "react";
import { managerAccountPrivileges } from "@/lib/delegation-rules";
import { api } from "@/lib/client-api";
export default function DelegationEditor({ userId }: { userId: string }) {
  const [data, setData] = useState<any>(null),
    [target, setTarget] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const d = await api("/api/account-management");
    setData(d);
    setTarget(d.accounts.find((u: any) => u.id === userId));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [userId]);
  if (!target || target.role === "Admin") return null;
  const toggle = (key: string, value: string, checked: boolean) =>
    setTarget((u: any) => ({
      ...u,
      [key]: checked
        ? [...u[key], value]
        : u[key].filter((v: string) => v !== value),
    }));
  return (
    <section className="panel">
      <h2>Individual permissions and delegated administration</h2>
      <p>
        Only Admin can change these assignments. They apply within this
        account's workspace access and do not grant Admin status. Managers
        already manage ordinary accounts wholly within their departments.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/api/account-management", {
              action: "delegation",
              id: userId,
              version: target.version,
              extraGrants: target.extraGrants,
              adminPrivileges: target.adminPrivileges,
            });
            await load();
            setNotice(
              "Delegation saved. Existing sessions for this person were revoked.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Additional section permissions</h3>
        <div className="permission-grid">
          {data.additionalCapabilities.map((c: string) => (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={target.extraGrants.includes(c)}
                onChange={(e) => toggle("extraGrants", c, e.target.checked)}
              />
              {c}
            </label>
          ))}
        </div>
        <h3>Specific administrative actions</h3>
        {Object.entries(data.privilegeDefinitions).map(([key, label]) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={
                target.adminPrivileges.includes(key) ||
                (target.role === "Manager" &&
                  managerAccountPrivileges.includes(key as any))
              }
              disabled={
                target.role === "Manager" &&
                managerAccountPrivileges.includes(key as any)
              }
              onChange={(e) => toggle("adminPrivileges", key, e.target.checked)}
            />
            {String(label)}{" "}
            {target.role === "Manager" &&
            managerAccountPrivileges.includes(key as any)
              ? "· Manager default"
              : ""}
          </label>
        ))}
        <button className="primary" disabled={busy}>
          Save individual privileges
        </button>
      </form>
    </section>
  );
}
