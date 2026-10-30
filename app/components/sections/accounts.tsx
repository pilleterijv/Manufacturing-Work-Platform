"use client";
import { useState, useEffect, useRef } from "react";
import { stats, capabilities, roles, type Capability } from "@/lib/rules";
import type { Data, Step, Cycle, Standard } from "@/lib/workspace-types";
import { api } from "@/lib/client-api";
import {
  Field,
  Submit,
  fmt,
  Metric,
  History,
  EquipmentSelect,
} from "../shared";
type Save = (body: unknown) => Promise<boolean>;
export default function Accounts({
  data,
  save,
  busy,
}: {
  data: Data;
  save: Save;
  busy: boolean;
}) {
  const [id, setId] = useState(""),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState("Operator"),
    [active, setActive] = useState(true),
    [password, setPassword] = useState("");
  function select(id: string) {
    setId(id);
    const u = data.users.find((u) => u.id === id);
    setUsername(u?.username ?? "");
    setName(u?.name ?? "");
    setRole(u?.role ?? "Operator");
    setActive(u?.active ?? true);
    setPassword("");
  }
  return (
    <>
      <section className="panel">
        <h2>{id ? "Update account" : "Create individual account"}</h2>
        <Field label="Account">
          <select
            aria-label="Standard work"
            value={id}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">New account</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
              </option>
            ))}
          </select>
        </Field>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                action: "user",
                ...(id ? { id } : {}),
                username,
                name,
                role,
                active,
                ...(password ? { password } : {}),
              })
            )
              select("");
          }}
        >
          <div className="form-grid">
            <Field label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="[a-z0-9._\-]{3,80}"
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={150}
              />
            </Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field
              label={
                id
                  ? "Reset password (leave empty to keep)"
                  : "Temporary password"
              }
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!id}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Account active
          </label>
          <p className="small muted">
            Temporary passwords must be changed at first sign-in. Updating an
            account revokes its existing sessions.
          </p>
          <Submit busy={busy}>
            {id ? "Update account" : "Create account"}
          </Submit>
        </form>
      </section>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Username</th>
              <th>Role</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>
                  <span className={"badge " + (!u.active ? "warn" : "")}>
                    {u.active ? "Active" : "Disabled"}
                  </span>
                  {u.mustChange && <small>Password change required</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
