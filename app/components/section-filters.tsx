"use client";
import { useState, useEffect } from "react";
import { api, type SectionFilters } from "@/lib/client-api";
export default function SectionFiltersBar({
  value,
  onApply,
}: {
  value: SectionFilters;
  onApply: (f: SectionFilters) => void;
}) {
  const [draft, setDraft] = useState(value),
    [people, setPeople] = useState<
      { id: string; name: string; username: string; active: boolean }[]
    >([]),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/people")
      .then((r) => setPeople(r.people))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        <label className="field">
          <span>Search this section</span>
          <input
            maxLength={150}
            placeholder="Names, equipment, tasks or descriptions"
            value={draft.search}
            onChange={(e) =>
              setDraft((d) => ({ ...d, search: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span>Find a person</span>
          <input
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type a name or username"
          />
        </label>
        <label className="field">
          <span>Filter by person</span>
          <select
            value={draft.person}
            onChange={(e) =>
              setDraft((d) => ({ ...d, person: e.target.value }))
            }
          >
            <option value="">Anyone in my permitted scope</option>
            {people
              .filter(
                (p) =>
                  p.id === draft.person ||
                  `${p.name} ${p.username}`
                    .toLowerCase()
                    .includes(name.toLowerCase()),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.username}){!p.active ? " · inactive" : ""}
                </option>
              ))}
          </select>
        </label>
        <div className="button-row">
          <button className="primary">Apply filters</button>
          <button
            type="button"
            className="outline"
            onClick={() => {
              setDraft({ person: "", search: "" });
              setName("");
              onApply({ person: "", search: "" });
            }}
          >
            Clear filters
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <p className="small muted">
        Filters apply to this section’s records and exports within your
        department/area permissions. Person means recorder or assigned owner;
        for equipment and standard lists it means assignment.
      </p>
    </section>
  );
}
