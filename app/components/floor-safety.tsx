"use client";
import { useEffect, useRef, useState } from "react";
export function confirmDraftChange() {
  return window.dispatchEvent(
    new Event("floorwork:discard", { cancelable: true }),
  );
}
export function useFloorSafety() {
  const dirty = useRef(new Set<HTMLFormElement>()),
    pending = useRef(new Set<HTMLFormElement>());
  const [changed, setChanged] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    const update = () => {
      for (const f of dirty.current)
        if (!f.isConnected) dirty.current.delete(f);
      setChanged(dirty.current.size > 0);
    };
    const form = (e: Event) =>
      (e.target as HTMLElement)?.closest(
        ".page form",
      ) as HTMLFormElement | null;
    const change = (e: Event) => {
      const f = form(e);
      if (f && !f.hasAttribute("data-no-draft")) {
        dirty.current.add(f);
        update();
        setStatus("Unsaved changes — submit the form to save.");
      }
    };
    const submit = (e: Event) => {
      const f = form(e);
      if (f) pending.current.add(f);
    };
    const reset = (e: Event) => {
      const f = form(e);
      if (f) {
        dirty.current.delete(f);
        pending.current.delete(f);
        update();
      }
    };
    const mutation = (event: Event) => {
      const { state, path } = (event as CustomEvent).detail;
      if (["/api/photos", "/api/guide-media"].includes(path)) return;
      if (state === "saving") setStatus("Saving… Keep this page open.");
      if (state === "saved") {
        for (const f of pending.current) dirty.current.delete(f);
        pending.current.clear();
        update();
        setStatus("Saved to the server.");
      }
      if (state === "failed") {
        pending.current.clear();
        update();
        setStatus(
          "Save not confirmed. Your entries remain here; check the error before retrying.",
        );
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if ([...dirty.current].some((f) => f.isConnected)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("input", change, true);
    const discard = (e: Event) => {
      const button = (e.target as HTMLElement)?.closest(".page button");
      if (
        !button ||
        !/^\s*(Cancel\b|Close editor\b)/i.test(button.textContent || "")
      )
        return;
      if ([...dirty.current].some((f) => f.isConnected)) {
        if (!window.confirm("Discard your unsaved entries?")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        dirty.current.clear();
        pending.current.clear();
        update();
        setStatus("");
      }
    };
    const discardRequest = (e: Event) => {
      if (
        [...dirty.current].some((f) => f.isConnected) &&
        !window.confirm("Discard your unsaved entries?")
      ) {
        e.preventDefault();
        return;
      }
      dirty.current.clear();
      pending.current.clear();
      update();
      setStatus("");
    };
    window.addEventListener("floorwork:discard", discardRequest);
    document.addEventListener("click", discard, true);
    const buttonChange = (e: Event) => {
      const b = (e.target as HTMLElement)?.closest(
        "button",
      ) as HTMLButtonElement | null;
      if (
        b?.type === "button" &&
        !/^\s*(Cancel\b|Close\b|Refresh\b)/i.test(b.textContent || "")
      )
        change(e);
    };
    document.addEventListener("click", buttonChange, true);
    document.addEventListener("change", change, true);
    document.addEventListener("submit", submit, true);
    document.addEventListener("reset", reset, true);
    window.addEventListener("floorwork:mutation", mutation);
    window.addEventListener("beforeunload", leave);
    return () => {
      document.removeEventListener("input", change, true);
      document.removeEventListener("click", discard, true);
      document.removeEventListener("click", buttonChange, true);
      window.removeEventListener("floorwork:discard", discardRequest);
      document.removeEventListener("change", change, true);
      document.removeEventListener("submit", submit, true);
      document.removeEventListener("reset", reset, true);
      window.removeEventListener("floorwork:mutation", mutation);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  return {
    changed,
    status,
    confirmLeave: () =>
      ![...dirty.current].some((f) => f.isConnected) ||
      window.confirm(
        "You have unsaved entries. Leave this form and discard them?",
      ),
    clear: () => {
      dirty.current.clear();
      pending.current.clear();
      setChanged(false);
      setStatus("");
    },
  };
}
