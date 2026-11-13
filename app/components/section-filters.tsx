"use client";
import { useState, useEffect } from "react";
import { searchSettings } from "@/lib/section-search";
import SearchPicker, { type SearchChoice } from "./search-picker";
import { api, type SectionFilters } from "@/lib/client-api";
export default function SectionFiltersBar({
  value,
  section,
  onApply,
}: {
  value: SectionFilters;
  section: string;
  onApply: (f: SectionFilters) => void;
}) {
  const settings = searchSettings(section);
  const [draft, setDraft] = useState(value),
    [people, setPeople] = useState<
      { id: string; name: string; username: string; active: boolean }[]
    >([]),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const [options, setOptions] = useState<SearchChoice[]>([]);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const controller = new AbortController();
    api("/api/people", undefined, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setPeople(r.people);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
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
  if (!settings) return null;
  const choices = options;
  const selectedPerson = people.find((p) => p.id === draft.person);
  return (
    <section className="panel">
      <form
        className="form-grid"
        aria-label={`${section} search filters`}
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        <SearchPicker
          label={settings.label}
          value={draft.search}
          onChange={(v) => setDraft((d) => ({ ...d, search: v }))}
          onSelect={(c) => setDraft((d) => ({ ...d, search: c.value }))}
          choices={choices}
          placeholder={settings.placeholder}
        />
        <SearchPicker
          label={settings.personLabel!}
          selection={draft.person}
          value={
            name ||
            (selectedPerson
              ? `${selectedPerson.name} (${selectedPerson.username})`
              : "")
          }
          onChange={(text) => {
            setName(text);
            setDraft((d) => ({ ...d, person: "" }));
          }}
          onSelect={(c) => {
            setDraft((d) => ({ ...d, person: c.value }));
            setName(c.label);
          }}
          choices={people.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.username})`,
            kind: p.active ? "Person" : "Inactive account",
          }))}
          placeholder="Choose a name or username to apply"
        />
        <div className="button-row">
          <button className="primary" disabled={!!name.trim() && !draft.person}>
            Apply filters
          </button>
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
        {settings.help} {settings.personHelp} Filters and exports stay within
        your permitted departments and areas.
      </p>
      {!!name.trim() && !draft.person && (
        <p className="small" role="status">
          Choose a person from the suggestions, or clear the name to search
          without a person filter.
        </p>
      )}
    </section>
  );
}
