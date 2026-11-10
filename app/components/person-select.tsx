"use client";
import { useState, type SelectHTMLAttributes } from "react";
// Keep native select keyboard/touch behavior; search narrows the account directory.
export default function PersonSelect({
  people,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  people: { id: string; name: string; username?: string; active?: boolean }[];
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | string[]>(() =>
    props.multiple
      ? Array.isArray(props.defaultValue)
        ? [...props.defaultValue]
        : []
      : String(props.defaultValue ?? ""),
  );
  const value = props.value ?? picked;
  const selected = Array.isArray(value) ? value : [String(value)];
  return (
    <span className="person-picker">
      <input
        aria-label="Search employee directory"
        placeholder="Search name or username"
        value={query}
        maxLength={150}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        {...props}
        defaultValue={undefined}
        value={value}
        onChange={(e) => {
          setPicked(
            props.multiple
              ? Array.from(e.target.selectedOptions, (o) => o.value)
              : e.target.value,
          );
          props.onChange?.(e);
        }}
      >
        {!props.multiple && <option value="">Choose a person</option>}
        {people
          .filter(
            (p) =>
              selected.includes(p.id) ||
              `${p.name} ${p.username ?? ""}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((p) => (
            <option key={p.id} value={p.id} disabled={p.active === false}>
              {p.name}
              {p.username ? ` (${p.username})` : ""}
            </option>
          ))}
        {children}
      </select>
    </span>
  );
}
