"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { openWorkflow } from "@/lib/floor-navigation";
export default function RelatedOpen({ equipment }: { equipment: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    if (!equipment) return;
    const c = new AbortController();
    api(
      "/api/related-open?equipment=" + encodeURIComponent(equipment),
      undefined,
      c.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [equipment]);
  if (!equipment) return null;
  return (
    <aside className="notice" aria-label="Existing machine issues">
      {error ? (
        <p>Could not check for existing issues. {error}</p>
      ) : !data ? (
        <p>Checking existing machine issues…</p>
      ) : (
        <>
          <strong>Check before creating another report</strong>
          {!data.defects.length && !data.problems.length ? (
            <p>No open issues found for this machine.</p>
          ) : (
            <>
              <p>
                These issues are already open. Review them before reporting the
                same condition. Up to 10 of each type are shown.
              </p>
              {[
                ["Defect reporting", data.defects],
                ["Problem solving", data.problems],
              ].flatMap(([tab, rows]: any) =>
                (rows as any[]).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="outline"
                    onClick={() =>
                      openWorkflow({ tab, filters: { item: r.id } })
                    }
                  >
                    {r.reference || "Defect"}: {r.title}
                  </button>
                )),
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
