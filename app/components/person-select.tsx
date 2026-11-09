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
  const selected = Array.isArray(props.value)
    ? props.value
    : [props.value ?? props.defaultValue];
  return (
    <span className="person-picker">
      <input
        aria-label="Search employee directory"
        placeholder="Search name or username"
        value={query}
        maxLength={150}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select {...props}>
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
