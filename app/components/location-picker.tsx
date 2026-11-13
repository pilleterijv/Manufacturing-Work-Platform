"use client";
import { referenceDepartments, referenceAreas } from "@/lib/reference-catalog";
import { useState } from "react";
import type { Data, Location } from "@/lib/workspace-types";
import { Field } from "./shared";
export function LocationPicker({ data }: { data: Data }) {
  const rows = data.locations ?? [];
  const [plant, setPlant] = useState(""),
    [department, setDepartment] = useState(""),
    [area, setArea] = useState("");
  const options = (items: string[]) =>
    [...new Set(items)].sort().map((s) => (
      <option key={s} value={s}>
        {s || "No line"}
      </option>
    ));
  return (
    <>
      <Field label="Plant">
        <select
          name="plant"
          required
          value={plant}
          onChange={(e) => {
            setPlant(e.target.value);
            setDepartment("");
            setArea("");
          }}
        >
          <option value="">Choose a plant</option>
          {options(rows.map((r) => r.plant))}
        </select>
      </Field>
      <Field label="Department">
        <select
          name="department"
          required
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setArea("");
          }}
        >
          <option value="">Choose a department</option>
          {options(
            rows.filter((r) => r.plant === plant).map((r) => r.department),
          )}
        </select>
      </Field>
      <Field label="Area">
        <select
          name="area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">No area</option>
          {options(
            rows
              .filter(
                (r) =>
                  r.plant === plant && r.department === department && r.area,
              )
              .map((r) => r.area),
          )}
        </select>
      </Field>
      <Field label="Line">
        <select name="line" key={[plant, department, area].join("/")}>
          <option value="">No line</option>
          {options(
            rows
              .filter(
                (r) =>
                  r.plant === plant &&
                  r.department === department &&
                  r.area === area &&
                  r.line,
              )
              .map((r) => r.line),
          )}
        </select>
      </Field>
    </>
  );
}
export function LocationsEditor({
  data,
  save,
  busy,
}: {
  data: Data;
  save: (b: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [mode, setMode] = useState("department"),
    [parent, setParent] = useState("");
  const rows = data.locations ?? [],
    parents = rows.filter(
      (r, i) =>
        rows.findIndex(
          (x) =>
            x.plant === r.plant &&
            x.department === r.department &&
            (mode !== "line" || x.area === r.area),
        ) === i &&
        (mode !== "line" || r.area),
    );
  const chosen = rows.find((r) => r.id === parent);
  return (
    <section className="panel">
      <h2>Departments, areas and lines</h2>
      <p className="muted">
        Create the official names here, then use the dropdowns throughout the
        app. Existing equipment names and historical records are retained.
      </p>
      <details>
        <summary>
          Load departments and known areas from the supplied forms
        </summary>
        <p>{referenceDepartments.join(" · ")}</p>
        <p>
          All departments use the area names you supplied.
          Maintenance/Facilities is the maintenance department name retained
          from your workbooks. Existing entries and access permissions are
          preserved.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            if (
              await save({
                action: "seed-catalog",
                plant: new FormData(f).get("plant"),
              })
            )
              f.reset();
          }}
        >
          <Field label="Plant / site for reference catalog">
            <input
              name="plant"
              required
              maxLength={100}
              list="reference-catalog-sites"
              aria-label="Plant / site for reference catalog"
            />
          </Field>
          <datalist id="reference-catalog-sites">
            {[...new Set(rows.map((r) => r.plant))].map((plant) => (
              <option key={plant} value={plant} />
            ))}
          </datalist>
          <button className="outline" disabled={busy}>
            Add reference department / area catalog
          </button>
        </form>
      </details>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          if (
            await save({
              action: "location",
              plant: mode === "department" ? f.get("plant") : chosen?.plant,
              department:
                mode === "department"
                  ? f.get("department")
                  : chosen?.department,
              area:
                mode === "area"
                  ? f.get("name")
                  : mode === "line"
                    ? chosen?.area
                    : "",
              line: mode === "line" ? f.get("name") : "",
            })
          ) {
            form.reset();
            setParent("");
          }
        }}
      >
        <Field label="Add location type">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setParent("");
            }}
          >
            <option value="department">Department</option>
            <option value="area">Area</option>
            <option value="line">Line</option>
          </select>
        </Field>
        {mode === "department" ? (
          <div className="form-grid">
            <Field label="Plant name">
              <input
                name="plant"
                list="official-plants"
                required
                maxLength={100}
              />
              <datalist id="official-plants">
                {[...new Set(rows.map((r) => r.plant))].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </datalist>
            </Field>
            <Field label="New department name">
              <input name="department" required maxLength={100} />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Parent location">
              <select
                required
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                <option value="">
                  Choose existing {mode === "line" ? "area" : "department"}
                </option>
                {parents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.plant, r.department, mode === "line" ? r.area : ""]
                      .filter(Boolean)
                      .join(" / ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`New ${mode} name`}>
              <input name="name" required maxLength={100} />
            </Field>
          </>
        )}
        <button disabled={busy} className="primary">
          Add {mode}
        </button>
      </form>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {[r.plant, r.department, r.area, r.line]
              .filter(Boolean)
              .join(" / ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
