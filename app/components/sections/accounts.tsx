"use client";
import { AccessRequests } from "../access-forms";
import { LocationsEditor } from "../location-picker";
import DowntimeAccessEditor from "../downtime-access-editor";
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
  admin,
  reload,
}: {
  data: Data;
  save: Save;
  busy: boolean;
  admin: boolean;
  reload: () => void;
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [id, setId] = useState(""),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("Operator"),
    [active, setActive] = useState(true),
    [password, setPassword] = useState("");
  function select(id: string) {
    setId(id);
    const u = data.users.find((u) => u.id === id);
    setUsername(u?.username ?? "");
    setName(u?.name ?? "");
    setEmail(u?.email ?? "");
    setRole(u?.role ?? "Operator");
    setActive(u?.active ?? true);
    setPassword("");
  }
  return (
    <>
      {admin && <AccessRequests reload={reload} />}
      {admin && <LocationsEditor data={data} save={save} busy={busy} />}
      <section className="panel">
        <h2>{id ? "Update account" : "Create individual account"}</h2>
        <Field label="Search accounts">
          <input
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            placeholder="Search name or username"
          />
        </Field>
        <Field label="Account">
          <select
            aria-label="Account"
            value={id}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">New account</option>
            {data.users
              .filter(
                (u) =>
                  u.id === id ||
                  `${u.name} ${u.username}`
                    .toLowerCase()
                    .includes(accountSearch.toLowerCase()),
              )
              .map((u) => (
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
                email,
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
            <Field label="Email address">
              <input
                type="email"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="For shift notifications"
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
      {admin && id && (
        <section className="panel">
          <h2>Account password email and department dashboard</h2>
          <button
            onClick={async () => {
              try {
                const r = await api("/api/access-requests", {
                  action: "resend",
                  userId: id,
                });
                alert(
                  r.emailSent
                    ? "Password email sent"
                    : "Email was not sent. Check the account email and SMTP configuration.",
                );
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          >
            Send password setup/reset email
          </button>
          {["Admin", "Manager", "DL/TL"].includes(role) && (
            <Field label="Assign department dashboard">
              <select
                key={
                  id +
                  JSON.stringify(
                    data.users.find((u) => u.id === id)?.dashboardDepartment,
                  )
                }
                defaultValue={
                  data.users.find((u) => u.id === id)?.dashboardDepartment
                    ? JSON.stringify(
                        data.users.find((u) => u.id === id)
                          ?.dashboardDepartment,
                      )
                    : ""
                }
                onChange={async (e) => {
                  try {
                    await api("/api/personal-dashboard", {
                      userId: id,
                      department: e.target.value
                        ? JSON.parse(e.target.value)
                        : null,
                    });
                  } catch (err) {
                    alert((err as Error).message);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Disabled</option>
                {[
                  ...new Map(
                    data.equipment.map((e) => [
                      JSON.stringify({
                        plant: e.plant,
                        department: e.department,
                      }),
                      e,
                    ]),
                  ).entries(),
                ].map(([key, e]) => (
                  <option value={key} key={key}>
                    {e.plant} / {e.department}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </section>
      )}
      {admin && id && data.users.find((u) => u.id === id) && (
        <>
          <DowntimeAccessEditor
            key={id + "workspace"}
            workspace
            locations={data.locations}
            user={data.users.find((u) => u.id === id)!}
            equipment={data.equipment}
            save={save}
            busy={busy}
          />
          <DowntimeAccessEditor
            key={id}
            user={data.users.find((u) => u.id === id)!}
            equipment={data.equipment}
            save={save}
            busy={busy}
          />
        </>
      )}
      {admin && !id && (
        <p className="small muted">
          Create the account, then select it to assign its departments, areas,
          downtime locations and machines.
        </p>
      )}
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
