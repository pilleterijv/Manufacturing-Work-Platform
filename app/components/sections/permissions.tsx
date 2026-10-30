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
export default function Permissions({
  data,
  save,
  busy,
}: {
  data: Data;
  save: Save;
  busy: boolean;
}) {
  const [role, setRole] = useState("Manager"),
    [checked, setChecked] = useState<Capability[]>(
      data.policies.find((p) => p.role === "Manager")?.grants ?? [],
    );
  return (
    <section className="panel">
      <h2>Role permissions</h2>
      <p className="muted">
        Changes apply to the next server request. Admin retains all permissions
        to prevent accidental lockout.
      </p>
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setChecked(
              data.policies.find((p) => p.role === e.target.value)?.grants ??
                [],
            );
          }}
        >
          {roles
            .filter((r) => r !== "Admin")
            .map((r) => (
              <option key={r}>{r}</option>
            ))}
        </select>
      </Field>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({ action: "policy", role, grants: checked });
        }}
      >
        <div className="permission-grid">
          {capabilities.map((cap) => (
            <label className="permission" key={cap}>
              <input
                type="checkbox"
                checked={checked.includes(cap)}
                onChange={(e) =>
                  setChecked(
                    e.target.checked
                      ? [...checked, cap]
                      : checked.filter((c) => c !== cap),
                  )
                }
              />
              <span>
                <strong>{cap}</strong>
                <small>Allow {cap} actions</small>
              </span>
            </label>
          ))}
        </div>
        <Submit busy={busy}>Save role permissions</Submit>
      </form>
      <p className="small muted">
        Roles currently apply across the workspace. Plant and line restrictions
        are not implemented.
      </p>
    </section>
  );
}
