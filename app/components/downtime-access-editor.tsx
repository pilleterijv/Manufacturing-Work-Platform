"use client";
import { useState } from "react";
import {
  type DowntimeAccess,
  allDowntimeAccess,
  departmentKey,
} from "@/lib/downtime-access-rules";
import type { Equipment } from "@/lib/workspace-types";
export default function DowntimeAccessEditor({
  user,
  equipment,
  save,
  busy,
}: {
  user: {
    id: string;
    name: string;
    role: string;
    downtimeAccess?: DowntimeAccess;
  };
  equipment: Equipment[];
  save: (body: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [access, setAccess] = useState<DowntimeAccess>(
    user.role === "Admin"
      ? allDowntimeAccess
      : (user.downtimeAccess ?? allDowntimeAccess),
  );
  const departments = [
    ...new Map(equipment.map((e) => [departmentKey(e), e])).values(),
  ].sort(
    (a, b) =>
      a.plant.localeCompare(b.plant) ||
      a.department.localeCompare(b.department),
  );
  const assigned = (plant: string, department: string, area: string | null) =>
    access.locations.some(
      (l) =>
        l.plant === plant && l.department === department && l.area === area,
    );
  function location(
    plant: string,
    department: string,
    area: string | null,
    enabled: boolean,
  ) {
    setAccess((a) => ({
      ...a,
      locations: [
        ...a.locations.filter(
          (l) =>
            !(
              l.plant === plant &&
              l.department === department &&
              l.area === area
            ),
        ),
        ...(enabled ? [{ plant, department, area }] : []),
      ],
    }));
  }
  return (
    <section className="panel">
      <h2>Downtime location access · {user.name}</h2>
      <p className="muted">
        Choose where this person can record downtime. Assignments add together.
        A whole department or area includes its current and future machines;
        individual machine assignments follow that machine if its location
        changes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({ action: "downtimeAccess", id: user.id, access });
        }}
      >
        <label className="field">
          <span>Downtime access</span>
          <select
            aria-label="Downtime access"
            disabled={user.role === "Admin"}
            value={access.mode}
            onChange={(e) =>
              setAccess((a) => ({
                ...a,
                mode: e.target.value as DowntimeAccess["mode"],
              }))
            }
          >
            <option value="all">All locations and machines</option>
            <option value="restricted">
              Only assigned locations and machines
            </option>
          </select>
        </label>
        {user.role === "Admin" && (
          <p className="small muted">
            Administrators retain access to all machines.
          </p>
        )}
        {access.mode === "restricted" && (
          <>
            <p className="small muted">
              With no assignments, this person cannot record downtime. Location
              assignments include the plant so departments with the same name
              remain separate.
            </p>
            <div className="access-tree">
              {departments.map((d) => {
                const key = departmentKey(d),
                  allDepartment = assigned(d.plant, d.department, null),
                  machines = equipment.filter((e) => departmentKey(e) === key),
                  areas = [...new Set(machines.map((e) => e.area))].sort();
                return (
                  <details key={key} open>
                    <summary>
                      {d.department || "Unassigned department"} ·{" "}
                      {d.plant || "Unassigned plant"}
                    </summary>
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label={`Allow department ${d.department} at ${d.plant}`}
                        checked={allDepartment}
                        onChange={(e) =>
                          location(
                            d.plant,
                            d.department,
                            null,
                            e.target.checked,
                          )
                        }
                      />
                      All areas and machines in this department
                    </label>
                    {areas.map((area) => {
                      const allArea =
                        allDepartment || assigned(d.plant, d.department, area);
                      return (
                        <div className="access-area" key={area}>
                          <label className="check">
                            <input
                              type="checkbox"
                              aria-label={`Allow area ${area} in ${d.department} at ${d.plant}`}
                              disabled={allDepartment}
                              checked={allArea}
                              onChange={(e) =>
                                location(
                                  d.plant,
                                  d.department,
                                  area,
                                  e.target.checked,
                                )
                              }
                            />
                            <strong>
                              {area || "No area configured"} · all machines
                            </strong>
                          </label>
                          <div className="participant-picker">
                            {machines
                              .filter((e) => e.area === area)
                              .map((eq) => (
                                <label
                                  className="participant-option"
                                  key={eq.id}
                                >
                                  <input
                                    type="checkbox"
                                    aria-label={`Allow machine ${eq.name} ${eq.id}`}
                                    disabled={allArea}
                                    checked={
                                      allArea ||
                                      access.equipmentIds.includes(eq.id)
                                    }
                                    onChange={(e) =>
                                      setAccess((a) => ({
                                        ...a,
                                        equipmentIds: e.target.checked
                                          ? [...a.equipmentIds, eq.id]
                                          : a.equipmentIds.filter(
                                              (id) => id !== eq.id,
                                            ),
                                      }))
                                    }
                                  />
                                  <span>
                                    {eq.name}
                                    {eq.line ? ` · ${eq.line}` : ""}
                                  </span>
                                </label>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                  </details>
                );
              })}
            </div>
          </>
        )}
        <p className="small muted">
          Changes take effect on the next server request, including
          already-running timers. Downtime history, live timers and operational
          downtime exports follow these assignments. Overall/department
          dashboards remain controlled by dashboard and leadership permissions.
        </p>
        <button className="primary" disabled={busy || user.role === "Admin"}>
          Save downtime access
        </button>
      </form>
    </section>
  );
}
