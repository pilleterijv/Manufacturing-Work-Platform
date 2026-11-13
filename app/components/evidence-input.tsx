"use client";
import { useState } from "react";
import { mediaMime, readMediaFile, uploadVideo } from "@/lib/client-media";
import { api } from "@/lib/client-api";
import type { Evidence } from "@/lib/evidence";
// This module imports only the erased type; all authorization stays on the server.
export function EvidenceView({ media }: { media: Evidence[] }) {
  return (
    <div className="content-grid">
      {media.map((m) => (
        <figure key={m.id}>
          {m.kind === "photo" ? (
            <img
              className="photo-preview"
              src={`/api/photos/${m.id}`}
              alt={m.caption || "Evidence"}
            />
          ) : (
            <video
              controls
              playsInline
              preload="metadata"
              style={{ maxWidth: "100%", maxHeight: 360 }}
              src={`/api/guide-media/${m.id}`}
            />
          )}
          <figcaption>{m.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
export default function EvidenceInput({
  value,
  onChange,
  label = "Photo or video evidence",
  onBusy,
  singleKinds = false,
}: {
  value: Evidence[];
  onChange: (m: Evidence[]) => void;
  label?: string;
  onBusy?: (b: boolean) => void;
  singleKinds?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <label className="field">
        <span>{label}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          disabled={busy || value.length >= 20}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            onBusy?.(true);
            setError("");
            try {
              const video = mediaMime(f).startsWith("video/");
              if (
                singleKinds &&
                value.some((m) => m.kind === (video ? "video" : "photo"))
              )
                throw Error(
                  "Remove the existing attachment of this type before replacing it",
                );
              if (f.size > (video ? 32 : 8) * 1024 * 1024)
                throw Error(
                  video
                    ? "Video must be under 32 MB"
                    : "Photo must be under 8 MB",
                );
              const r = video
                ? await uploadVideo(f)
                : await api("/api/photos", { image: await readMediaFile(f) });
              onChange([
                ...value,
                {
                  id: r.id,
                  kind: video ? "video" : "photo",
                  caption: f.name.slice(0, 500),
                },
              ]);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
              onBusy?.(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Uploading evidence…</p>}
      {error && <p role="alert">{error}</p>}
      <EvidenceView media={value} />
      {value.map((m, i) => (
        <div className="button-row" key={m.id}>
          <input
            aria-label={`Evidence caption ${i + 1}`}
            maxLength={500}
            value={m.caption}
            onChange={(e) =>
              onChange(
                value.map((x, j) =>
                  i === j ? { ...x, caption: e.target.value } : x,
                ),
              )
            }
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            Remove attachment {i + 1}
          </button>
        </div>
      ))}
    </div>
  );
}
