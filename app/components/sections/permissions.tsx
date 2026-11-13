"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { capabilities, type Capability } from "@/lib/rules";
import {
  privilegeDefinitions,
  privilegeKeys,
  managerAccountPrivileges,
  type AdminPrivilege,
} from "@/lib/delegation-rules";
import { capabilityLabels } from "@/lib/role-rules";
import { Field } from "../shared";
import type { Data } from "@/lib/workspace-types";
import RefreshControl from "../refresh-control";
type Draft = {
  name: string;
  baseRole: string;
  description: string;
  grants: Capability[];
  adminPrivileges: AdminPrivilege[];
  version?: number;
  active?: boolean;
  assigned?: number;
};
export default function Permissions(_props: {
  data: Data;
  save: (b: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const next = await api("/api/roles");
    setData(next);
    return next;
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  function select(r: any) {
    setCreating(false);
    setDraft({ name: r.role, ...r });
    setError("");
    setNotice("");
  }
  async function save(action: string) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/roles", { ...draft, role: draft.name, action });
      const next = await load();
      const found = next.roles.find((r: any) => r.role === draft.name);
      setCreating(false);
      setDraft(found ? { name: found.role, ...found } : null);
      setNotice(
        action === "retire"
          ? "Role retired. History preserved."
          : "Role saved. Assign the role and departments/areas in Accounts.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Roles and permissions</h2>
        <p>
          A role defines what an account can do. Its department, area and
          machine assignments define where it can do it. Neither a custom role
          nor an editing privilege bypasses those assignments.
        </p>
        <p>
          Admin stays protected. Global role administration and unrestricted
          access remain with Admin.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="button-row">
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setError("");
              setNotice("");
              setDraft({
                name: "",
                baseRole: "Operator",
                description: "",
                grants: [],
                adminPrivileges: [],
                active: true,
              });
            }}
          >
            Create custom role
          </button>
          <RefreshControl onRefresh={load} label="Refresh roles" />
        </div>
        {data && (
          <Field label="Choose role to review">
            <select
              aria-label="Choose role to review"
              value={creating ? "" : draft?.name || ""}
              onChange={(e) => {
                const r = data.roles.find(
                  (r: any) => r.role === e.target.value,
                );
                if (r) select(r);
              }}
            >
              <option value="">Choose a role</option>
              {data.roles
                .filter((r: any) => r.role !== "Admin")
                .map((r: any) => (
                  <option key={r.role} value={r.role}>
                    {r.role}
                    {!r.active ? " · retired" : ""} · {r.assigned} accounts
                  </option>
                ))}
            </select>
          </Field>
        )}
      </section>
      {draft && (
        <section className="panel">
          <h2>{creating ? "New custom role" : draft.name}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(creating ? "create" : "update");
            }}
          >
            <div className="form-grid">
              <Field label="Role name">
                <input
                  aria-label="Role name"
                  required
                  minLength={2}
                  maxLength={60}
                  disabled={!creating}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Workflow type">
                <select
                  aria-label="Workflow type"
                  disabled={!creating}
                  value={draft.baseRole}
                  onChange={(e) =>
                    setDraft({ ...draft, baseRole: e.target.value })
                  }
                >
                  <option value="Operator">Operator / floor tasks</option>
                  <option value="DL/TL">
                    Department / team leader workflows
                  </option>
                  <option value="Manager">Manager workflows</option>
                </select>
              </Field>
              <Field label="Role purpose">
                <textarea
                  maxLength={500}
                  value={draft.description}
                  disabled={!draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </Field>
            </div>
            <p>
              Workflow type determines leader-task eligibility and
              manager/leader notification eligibility. It does not grant extra
              editing or account-management rights to a custom role. Choose
              those explicitly below.
            </p>
            <h3>Functions this role can use</h3>
            <div className="permission-grid">
              {capabilities
                .filter((c) => !["users", "permissions"].includes(c))
                .map((cap) => (
                  <label className="permission" key={cap}>
                    <input
                      type="checkbox"
                      disabled={!draft.active}
                      checked={draft.grants.includes(cap)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          grants: e.target.checked
                            ? [...draft.grants, cap]
                            : draft.grants.filter((c) => c !== cap),
                        })
                      }
                    />
                    <span>
                      <strong>{capabilityLabels[cap].label}</strong>
                      <small>{capabilityLabels[cap].detail}</small>
                    </span>
                  </label>
                ))}
            </div>
            {draft.grants.includes("manage") && (
              <p className="notice">
                Broad content editing is enabled. Use the specific editing
                privileges below if this role should edit only PMs, guides,
                equipment or a particular kind of content.
              </p>
            )}
            <h3>Specific management privileges</h3>
            {draft.name === "Manager" && !creating && (
              <p>
                The built-in Manager role keeps its existing department-account
                rights. Use a custom Manager workflow role to choose those
                rights individually.
              </p>
            )}
            <div className="permission-grid">
              {privilegeKeys.map((key) => {
                const inherited =
                  draft.name === "Manager" &&
                  !creating &&
                  managerAccountPrivileges.includes(key);
                return (
                  <label className="permission" key={key}>
                    <input
                      type="checkbox"
                      disabled={!draft.active || inherited}
                      checked={inherited || draft.adminPrivileges.includes(key)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          adminPrivileges: e.target.checked
                            ? [...draft.adminPrivileges, key]
                            : draft.adminPrivileges.filter((k) => k !== key),
                        })
                      }
                    />
                    <span>
                      <strong>{privilegeDefinitions[key]}</strong>
                      <small>
                        Only within the account's assigned scope
                        {inherited ? " · existing Manager right" : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <p>
              {draft.grants.length} function permissions and{" "}
              {draft.adminPrivileges.length} explicit management privileges.
              Account-level extra permissions can add to this role; review them
              in Accounts when checking someone's effective access.
            </p>
            <div className="button-row">
              <button className="primary" disabled={busy || !draft.active}>
                Save role permissions
              </button>
              {!creating &&
                !["Manager", "Operator", "DL/TL"].includes(draft.name) &&
                draft.active && (
                  <button
                    className="outline"
                    type="button"
                    disabled={busy || !!draft.assigned}
                    onClick={() => {
                      if (
                        confirm(
                          `Retire ${draft.name}? Reassign all accounts first. Role history remains available.`,
                        )
                      )
                        void save("retire");
                    }}
                  >
                    Retire role
                  </button>
                )}
              <button
                type="button"
                className="outline"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Close role editor
              </button>
            </div>
            {!!draft.assigned && (
              <p>
                {draft.assigned} accounts use this role, including any disabled
                accounts. Reassign them before retirement.
              </p>
            )}
          </form>
        </section>
      )}
      {data && (
        <section className="panel">
          <h2>Recent role changes</h2>
          <p>
            Changes apply on subsequent requests. Existing account locations and
            completed work are preserved.
          </p>
          {!data.audit.length && <p>No role changes recorded yet.</p>}
          {data.audit.map((a: any) => (
            <details key={a.id}>
              <summary>
                {a.role} · {a.action} · {new Date(a.createdAt).toLocaleString()}
              </summary>
              <p>Changed by {a.actorName}</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(a.snapshot, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
