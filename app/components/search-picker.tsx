"use client";
import { useId, useState, useRef, useEffect } from "react";
export type SearchChoice = {
  value: string;
  label: string;
  kind?: string;
  detail?: string;
  searchText?: string;
};
export default function SearchPicker({
  label,
  value,
  onChange,
  onSelect,
  choices,
  placeholder,
  selection,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: SearchChoice) => void;
  choices: SearchChoice[];
  placeholder?: string;
  selection?: string;
}) {
  const id = useId(),
    box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  useEffect(() => {
    setOpen(false);
    setActive(-1);
  }, [selection]);
  const results = choices
    .filter((c) =>
      `${c.label} ${c.value} ${c.kind || ""} ${c.searchText || ""}`
        .toLowerCase()
        .includes(value.toLowerCase()),
    )
    .slice(0, 40);
  function select(choice: SearchChoice) {
    onSelect(choice);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="search-picker"
      ref={box}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label className="field">
        <span>{label}</span>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 && results[active]
              ? `${id}-${active}`
              : undefined
          }
          maxLength={150}
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              e.preventDefault();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((a) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    a + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open && active >= 0 && results[active]) {
              e.preventDefault();
              select(results[active]);
            }
          }}
        />
      </label>
      <button
        type="button"
        className="search-toggle"
        aria-label={`Show ${label.toLowerCase()} suggestions`}
        onClick={() => {
          box.current?.querySelector("input")?.focus();
          setOpen(true);
        }}
      >
        ⌄
      </button>
      {open && (
        <div
          className="search-suggestions"
          role="listbox"
          id={id}
          aria-label={`${label} suggestions`}
        >
          {results.map((c, i) => (
            <div
              role="option"
              aria-selected={active === i}
              id={`${id}-${i}`}
              key={`${c.kind}:${c.value}:${c.label}`}
              className={active === i ? "suggestion active" : "suggestion"}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => select(c)}
            >
              <strong>{c.label}</strong>
              {c.kind && (
                <small>
                  {c.kind}
                  {c.detail ? " · " + c.detail : ""}
                </small>
              )}
            </div>
          ))}
          {!results.length && (
            <p role="status">
              No matching suggestions. You can still type a search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
