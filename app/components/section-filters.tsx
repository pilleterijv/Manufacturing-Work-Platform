"use client";
import { useState, useEffect } from "react";
import SearchPicker, { type SearchChoice } from "./search-picker";
import { api, type SectionFilters } from "@/lib/client-api";
export default function SectionFiltersBar({
  value,
  section,
  titles = [],
  onApply,
}: {
  value: SectionFilters;
  section: string;
  titles?: string[];
  onApply: (f: SectionFilters) => void;
}) {
  const [draft, setDraft] = useState(value),
    [people, setPeople] = useState<
      { id: string; name: string; username: string; active: boolean }[]
    >([]),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const [options, setOptions] = useState<SearchChoice[]>([]);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    api("/api/people")
      .then((r) => setPeople(r.people))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(
        "/api/section-options?" +
          new URLSearchParams({ section, q: draft.search }),
        undefined,
        controller.signal,
      )
        .then((r) => !controller.signal.aborted && setOptions(r.options))
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [section, draft.search]);
  const choices = [
    ...options,
    ...[...new Set(titles)].map((value) => ({
      value,
      label: value,
      kind: "Task / record",
    })),
  ];
  return (
    <section className="panel">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        <SearchPicker
          label="Search this section"
          value={draft.search}
          onChange={(v) => setDraft((d) => ({ ...d, search: v }))}
          onSelect={(c) => setDraft((d) => ({ ...d, search: c.value }))}
          choices={choices}
          placeholder="Choose or type equipment, an area or a task"
        />
        <SearchPicker
          label="Find a person"
          selection={draft.person}
          value={name}
          onChange={setName}
          onSelect={(c) => {
            setDraft((d) => ({ ...d, person: c.value }));
            setName(c.label);
          }}
          choices={people.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.username})`,
            kind: p.active ? "Person" : "Inactive account",
          }))}
          placeholder="Choose or type a name or username"
        />
        <label className="field">
          <span>Filter by person</span>
          <select
            aria-label="Filter by person"
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
