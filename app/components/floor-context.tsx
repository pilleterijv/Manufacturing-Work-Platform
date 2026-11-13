"use client";
import { useEffect, useRef, useState } from "react";
type Machine = {
  id: string;
  name: string;
  plant: string;
  department: string;
  area: string;
  line: string;
};
export default function FloorContext({
  equipment,
  shifts,
  timezone,
  onOpen,
}: {
  equipment: Machine[];
  shifts: string[];
  timezone: string;
  onOpen: (id: string) => void;
}) {
  const [machine, setMachine] = useState(""),
    [shift, setShift] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (machine && !equipment.some((e) => e.id === machine)) setMachine("");
  }, [equipment, machine]);
  useEffect(() => {
    const pick = (e: Event) => {
      const el = e.target as HTMLSelectElement;
      if (el.tagName === "SELECT" && equipment.some((m) => m.id === el.value))
        setMachine(el.value);
    };
    document.addEventListener("change", pick);
    return () => document.removeEventListener("change", pick);
  }, [equipment]);
  function resolve(raw: string) {
    setError("");
    let id = raw.trim();
    try {
      const u = new URL(id);
      if (u.origin !== location.origin)
        throw Error("Use a machine label from this app.");
      id = u.searchParams.get("machine") || "";
    } catch (e) {
      if (/^https?:/i.test(id)) {
        setError("Use a machine label from this app.");
        return;
      }
    }
    if (!equipment.some((e) => e.id === id)) {
      setError("Machine not found in your assigned locations.");
      return;
    }
    setMachine(id);
    setScanning(false);
    setCode("");
  }
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | undefined,
      stopped = false,
      frame: number;
    async function scan() {
      try {
        const Detector = (window as any).BarcodeDetector;
        if (!Detector)
          throw Error(
            "Camera scanning is unavailable in this browser. Open the machine QR link with your tablet camera, or paste its machine ID below.",
          );
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current!.srcObject = stream;
        await video.current!.play();
        const detector = new Detector({
          formats: ["qr_code", "code_128", "code_39"],
        });
        const tick = async () => {
          if (stopped) return;
          try {
            const hits = await detector.detect(video.current);
            if (hits[0]) {
              resolve(hits[0].rawValue);
              return;
            }
          } catch {}
          frame = window.setTimeout(tick, 250);
        };
        void tick();
      } catch (e) {
        setError((e as Error).message);
        setScanning(false);
      }
    }
    void scan();
    return () => {
      stopped = true;
      clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);
  useEffect(() => {
    const id = new URL(location.href).searchParams.get("machine");
    if (id) resolve(id);
  }, []);
  const e = equipment.find((e) => e.id === machine);
  return (
    <section className="floor-context" aria-label="Machine and shift context">
      <div className="form-grid">
        <label className="field">
          <span>Machine context</span>
          <select
            aria-label="Machine context"
            value={machine}
            onChange={(v) => setMachine(v.target.value)}
          >
            <option value="">Confirm the machine for your work</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {[e.plant, e.department, e.area, e.name]
                  .filter(Boolean)
                  .join(" / ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Working shift ({timezone})</span>
          <select
            aria-label="Working shift"
            value={shift}
            onChange={(v) => setShift(v.target.value)}
          >
            <option value="">Choose current shift</option>
            {shifts.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {e && (
        <p>
          <strong>{e.name}</strong> · {e.plant} / {e.department} / {e.area}
          {e.line ? " / " + e.line : ""}
          {shift ? " · " + shift : ""}. Confirm this matches the machine on your
          form.{" "}
          <button
            type="button"
            className="outline"
            onClick={() => onOpen(e.id)}
          >
            Find this machine’s instructions
          </button>
        </p>
      )}
      <details>
        <summary>Scan or enter machine label</summary>
        <p>
          Use a label containing this app’s URL with{" "}
          <code>?machine=equipment-id</code>, or the machine ID. Camera support
          depends on the browser.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="outline"
            onClick={() => setScanning(!scanning)}
          >
            {scanning ? "Stop scanning" : "Scan machine label"}
          </button>
          <input
            aria-label="Machine label or ID"
            value={code}
            maxLength={2048}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            className="outline"
            onClick={() => resolve(code)}
          >
            Find machine
          </button>
        </div>
        {scanning && (
          <video ref={video} playsInline muted aria-label="Machine scanner" />
        )}
        {e && (
          <p>
            Machine label URL:{" "}
            <a href={"?machine=" + encodeURIComponent(e.id)}>
              {typeof window !== "undefined" ? window.location.origin : ""}
              /?machine={e.id}
            </a>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </details>
    </section>
  );
}
