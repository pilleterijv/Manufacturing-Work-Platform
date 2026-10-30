"use client";
export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(path, {
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
