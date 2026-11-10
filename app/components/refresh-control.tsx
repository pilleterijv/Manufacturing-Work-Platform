"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
export const SectionRefreshContext = createContext(0);
export function useSectionRefresh(
  reload: () => Promise<unknown>,
  onError: (e: Error) => void,
) {
  const revision = useContext(SectionRefreshContext),
    previous = useRef(revision),
    callback = useRef(reload),
    error = useRef(onError);
  callback.current = reload;
  error.current = onError;
  useEffect(() => {
    if (previous.current === revision) return;
    previous.current = revision;
    void callback.current().catch((e) => error.current(e));
  }, [revision]);
}
export default function RefreshControl({
  onRefresh,
  label = "Refresh history",
}: {
  onRefresh: () => Promise<unknown>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [at, setAt] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="refresh-control">
      <button
        type="button"
        className="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onRefresh();
            setAt(new Date().toLocaleTimeString());
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Refreshing…" : `↻ ${label}`}
      </button>
      {at && <small role="status">Updated {at}</small>}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
