"use client";
export type SectionFilters = { person: string; search: string };
let filters: SectionFilters = { person: "", search: "" };
export function getSectionFilters() {
  return filters;
}
export function setSectionFilters(value: SectionFilters) {
  filters = value;
}
export function filterUrl(path: string) {
  const [base, query] = path.split("?");
  if (
    ![
      "/api/platform",
      "/api/operations",
      "/api/problems",
      "/api/leadership",
      "/api/dashboard",
      "/api/export",
      "/api/maintenance",
      "/api/shift-schedules",
      "/api/external-data",
      "/api/reminders",
    ].includes(base)
  )
    return path;
  const p = new URLSearchParams(query);
  for (const [k, v] of Object.entries(filters)) if (v && !p.get(k)) p.set(k, v);
  return base + (p.size ? "?" + p : "");
}
export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(body ? path : filterUrl(path), {
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Request failed");
  return data;
}
