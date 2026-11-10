"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Field } from "../shared";
import DowntimeAccessEditor from "../downtime-access-editor";
export default function DepartmentAccounts() {
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const d = await api(
      "/api/account-management?search=" + encodeURIComponent(search),
    );
    setData(d);
    return d;
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function save(body: any) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/account-management", body);
      const d = await load();
      if (r.id) {
        const u = d.accounts.find((u: any) => u.id === r.id);
        setSelected(u ?? null);
        setDraft(u ? { ...u, password: "" } : null);
      }
      setNotice(
        body.action === "email"
          ? r.emailSent
            ? "Password email sent."
            : "Email was not sent. Ask Admin to check SMTP and the account email."
          : "Account saved. Account changes revoke existing sessions.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const p = data?.privileges ?? [];
  return (
    <>
      <section className="panel">
        <h2>Department accounts</h2>
        <p>
          People in your assigned departments and areas. Protected or
          broader-access accounts are visible when relevant and require Admin
          management.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <form
          className="button-row"
          onSubmit={(e) => {
            e.preventDefault();
            load().catch((e) => setError(e.message));
          }}
        >
          <Field label="Search department accounts">
            <input
              value={search}
              maxLength={150}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or username"
            />
          </Field>
          <button className="outline">Search accounts</button>
        </form>
        {p.includes("accounts.create") && (
          <button
            className="primary"
            onClick={() => {
              setSelected(null);
              setDraft({
                username: "",
                name: "",
                email: "",
                role: "Operator",
                password: "",
                locationId: "",
                equipmentId: "",
              });
            }}
          >
            Create department account
          </button>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {data?.accounts.map((u: any) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.username}</td>
                  <td>{u.role}</td>
                  <td>{u.active ? "Active" : "Disabled"}</td>
                  <td>
                    <button
                      className="outline"
                      onClick={() => {
                        setSelected(u);
                        setDraft({ ...u, password: "" });
                      }}
                    >
                      {u.canManage ? "Manage account" : "View account"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {draft && (
        <section className="panel">
          <h2>
            {selected ? `Account · ${selected.name}` : "New department account"}
          </h2>
          {selected && !selected.canManage ? (
            <p>{selected.readOnlyReason}</p>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selected) {
                    const l = data.locations.find(
                      (l: any) => l.id === draft.locationId,
                    );
                    if (!l && !draft.equipmentId) {
                      setError("Choose a department/area or machine");
                      return;
                    }
                    void save({
                      action: "create",
                      ...draft,
                      workspaceAccess: {
                        mode: "restricted",
                        locations: l
                          ? [
                              {
                                plant: l.plant,
                                department: l.department,
                                area: l.area,
                              },
                            ]
                          : [],
                        equipmentIds: draft.equipmentId
                          ? [draft.equipmentId]
                          : [],
                      },
                    });
                  } else
                    void save({
                      action: "profile",
                      id: selected.id,
                      version: selected.version,
                      name: draft.name,
                      email: draft.email,
                      role: draft.role,
                    });
                }}
              >
                {!selected && (
                  <Field label="New account username">
                    <input
                      required
                      pattern="[a-z0-9._\-]{3,80}"
                      maxLength={80}
                      value={draft.username}
                      onChange={(e) =>
                        setDraft({ ...draft, username: e.target.value })
                      }
                    />
                  </Field>
                )}
                <Field label="Account display name">
                  <input
                    required
                    maxLength={150}
                    disabled={!!selected && !p.includes("accounts.edit")}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Account work email">
                  <input
                    type="email"
                    maxLength={254}
                    value={draft.email ?? ""}
                    disabled={!!selected && !p.includes("accounts.edit")}
                    onChange={(e) =>
                      setDraft({ ...draft, email: e.target.value })
                    }
                  />
                </Field>
                <Field label="Department account role">
                  <select
                    value={draft.role}
                    disabled={!!selected && !p.includes("accounts.edit")}
                    onChange={(e) =>
                      setDraft({ ...draft, role: e.target.value })
                    }
                  >
                    <option>Operator</option>
                    <option>DL/TL</option>
                  </select>
                </Field>
                {!selected && (
                  <>
                    <Field label="Initial department / area">
                      <select
                        required={!draft.equipmentId}
                        aria-label="Initial department / area"
                        value={draft.locationId}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            locationId: e.target.value,
                            equipmentId: "",
                          })
                        }
                      >
                        <option value="">Choose a permitted area</option>
                        {data.locations.map((l: any) => (
                          <option key={l.id} value={l.id}>
                            {[l.plant, l.department, l.area, l.line]
                              .filter(Boolean)
                              .join(" / ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Initial machine (instead of an area)">
                      <select
                        aria-label="Initial machine (instead of an area)"
                        value={draft.equipmentId ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            equipmentId: e.target.value,
                            locationId: "",
                          })
                        }
                      >
                        <option value="">Choose a machine instead</option>
                        {data.equipment.map((e: any) => (
                          <option key={e.id} value={e.id}>
                            {[e.plant, e.department, e.area, e.name].join(
                              " / ",
                            )}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Initial temporary password">
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={draft.password}
                        onChange={(e) =>
                          setDraft({ ...draft, password: e.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
                {(!selected || p.includes("accounts.edit")) && (
                  <button className="primary" disabled={busy}>
                    {selected
                      ? "Save account details"
                      : "Create assigned account"}
                  </button>
                )}
              </form>
              {selected && (
                <>
                  <div className="button-row">
                    {p.includes("accounts.disable") && (
                      <button
                        className="outline"
                        disabled={busy}
                        onClick={() =>
                          void save({
                            action: "active",
                            id: selected.id,
                            version: selected.version,
                            active: !selected.active,
                          })
                        }
                      >
                        {selected.active ? "Disable account" : "Enable account"}
                      </button>
                    )}
                    {p.includes("accounts.reset") && (
                      <button
                        className="outline"
                        disabled={busy}
                        onClick={() =>
                          void save({
                            action: "email",
                            id: selected.id,
                            version: selected.version,
                          })
                        }
                      >
                        Send account password email
                      </button>
                    )}
                  </div>
                  {p.includes("accounts.reset") && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save({
                          action: "password",
                          id: selected.id,
                          version: selected.version,
                          password: draft.password,
                        });
                      }}
                    >
                      <Field label="Reset temporary password">
                        <input
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                          value={draft.password}
                          onChange={(e) =>
                            setDraft({ ...draft, password: e.target.value })
                          }
                        />
                      </Field>
                      <button className="outline" disabled={busy}>
                        Reset account password
                      </button>
                    </form>
                  )}
                  {p.includes("accounts.assign") && (
                    <DowntimeAccessEditor
                      key={selected.id + selected.version}
                      workspace
                      allowAll={false}
                      user={selected}
                      equipment={data.equipment}
                      locations={data.locations}
                      busy={busy}
                      save={(b) =>
                        save({
                          action: "access",
                          id: selected.id,
                          version: selected.version,
                          workspaceAccess: (b as any).access,
                        })
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
