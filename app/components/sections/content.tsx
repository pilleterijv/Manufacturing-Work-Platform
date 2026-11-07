"use client";
import PhotoEditor from "../photo-editor";
import { useState, useEffect, useRef } from "react";
import { stats, capabilities, roles, type Capability } from "@/lib/rules";
import type { Data, Step, Cycle, Standard } from "@/lib/workspace-types";
import { api } from "@/lib/client-api";
import {
  Field,
  Submit,
  fmt,
  Metric,
  History,
  EquipmentSelect,
} from "../shared";
type Save = (body: unknown) => Promise<boolean>;
export default function Content({
  data,
  kind,
  manage,
  save,
  busy,
}: {
  data: Data;
  kind: string;
  manage: boolean;
  save: Save;
  busy: boolean;
}) {
  const [search, setSearch] = useState(""),
    [playing, setPlaying] = useState(""),
    [editing, setEditing] = useState(""),
    [media, setMedia] = useState<
      { id: string; kind: "photo" | "video"; caption: string }[]
    >([]),
    [photo, setPhoto] = useState<{ src: string; index: number } | null>(null),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  async function upload(file: File) {
    setError("");
    if (media.length >= 20) {
      setError("Maximum 20 attachments");
      return;
    }
    if (file.type.startsWith("image/")) {
      if (file.size > 8 * 1024 * 1024) {
        setError("Photo must be under 8 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPhoto({ src: String(reader.result), index: -1 });
      reader.readAsDataURL(file);
      return;
    }
    setUploading(true);
    try {
      if (file.size > 32 * 1024 * 1024)
        throw Error("Video must be under 32 MB");
      const value = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const r = await api("/api/guide-media", { video: value });
      setMedia((m) => [...m, { id: r.id, kind: "video", caption: "" }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const items = data.content.filter(
    (c) =>
      c.kind === kind &&
      `${c.title} ${kind === "guide" ? c.body : ""} ${data.equipment.find((e) => e.id === c.equipmentId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="search-row">
        <input
          aria-label="Search library"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            kind === "video"
              ? "Search training videos or equipment…"
              : "Search troubleshooting guides or equipment…"
          }
        />
        <span className="muted">{items.length} resources</span>
      </div>
      <div className="content-grid">
        {items.map((c) => (
          <article className="panel resource" key={c.id}>
            {kind === "video" &&
              (playing === c.id ? (
                <iframe
                  title={c.title}
                  src={c.body}
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                />
              ) : (
                <button
                  className="video-cover"
                  onClick={() => setPlaying(c.id)}
                  aria-label={`Play ${c.title}`}
                >
                  <span>▷</span>
                  <small>PLAY TRAINING</small>
                </button>
              ))}
            <span className="eyebrow">
              {data.equipment.find((e) => e.id === c.equipmentId)?.name ??
                "ALL EQUIPMENT"}
            </span>
            <h2>{c.title}</h2>
            {kind === "guide" && (
              <>
                <p className="guide-body">{c.body}</p>
                {c.media?.map((m) => (
                  <figure key={m.id}>
                    {m.kind === "photo" ? (
                      <img
                        className="photo-preview"
                        src={`/api/photos/${m.id}`}
                        alt={m.caption || c.title}
                      />
                    ) : (
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        style={{ width: "100%" }}
                        src={`/api/guide-media/${m.id}`}
                      />
                    )}
                    <figcaption>{m.caption}</figcaption>
                  </figure>
                ))}
              </>
            )}
            {manage && kind === "guide" && (
              <button
                className="outline"
                onClick={() => {
                  setEditing(c.id);
                  setMedia(c.media ?? []);
                  setPhoto(null);
                  setTimeout(() => {
                    const f = formRef.current!;
                    (f.elements.namedItem("title") as HTMLInputElement).value =
                      c.title;
                    (
                      f.elements.namedItem("body") as HTMLTextAreaElement
                    ).value = c.body;
                    (
                      f.elements.namedItem("equipmentId") as HTMLSelectElement
                    ).value = c.equipmentId ?? "";
                    f.scrollIntoView({ behavior: "smooth" });
                  }, 0);
                }}
              >
                Edit guide and media
              </button>
            )}
            {manage && (
              <button
                className="text-button"
                onClick={() => void save({ action: "archive", id: c.id })}
              >
                Archive resource
              </button>
            )}
          </article>
        ))}
      </div>
      {!items.length && (
        <section className="panel empty">
          <h3>No resources found</h3>
          <p>
            {manage
              ? "Add a resource below to build your team’s library."
              : "Ask your manager to add a resource for this process."}
          </p>
        </section>
      )}
      {manage && (
        <section className="panel narrow">
          <h2>
            Add {kind === "video" ? "training video" : "troubleshooting guide"}
          </h2>
          <form
            ref={formRef}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (
                await save({
                  action: kind,
                  ...(editing ? { id: editing } : {}),
                  media,
                  title: f.get("title"),
                  equipmentId: f.get("equipmentId"),
                  body: f.get("body"),
                })
              ) {
                form.reset();
                setEditing("");
                setMedia([]);
                setPhoto(null);
              }
            }}
          >
            <Field label="Title">
              <input name="title" maxLength={150} required />
            </Field>
            <Field label="Equipment">
              <select name="equipmentId">
                <option value="">
                  Choose equipment (Admin may share with all)
                </option>
                {data.equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {[e.plant, e.department, e.area, e.name]
                      .filter(Boolean)
                      .join(" / ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={
                kind === "video"
                  ? "HTTPS YouTube or Vimeo video URL"
                  : "Troubleshooting instructions"
              }
            >
              {kind === "video" ? (
                <input
                  name="body"
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              ) : (
                <textarea name="body" rows={6} maxLength={10000} required />
              )}
            </Field>
            <p className="small muted">
              {kind === "video"
                ? "Videos play from the original provider. Use content your organization is permitted to share."
                : "Use approved site procedures and include escalation guidance."}
            </p>
            {kind === "guide" && (
              <>
                <Field label="Attach photos or videos from your device">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    disabled={uploading || media.length >= 20}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = "";
                    }}
                  />
                </Field>
                <p className="small muted">
                  Photos up to 8 MB; videos up to 32 MB. MP4 with H.264 is
                  recommended for iPads. MOV/WebM playback depends on the
                  device. Video editing is not included.
                </p>
                {media.map((m, i) => (
                  <div className="panel" key={m.id}>
                    {m.kind === "photo" ? (
                      <img
                        className="photo-preview"
                        src={`/api/photos/${m.id}`}
                        alt={m.caption || "Guide photo"}
                      />
                    ) : (
                      <video
                        style={{ maxWidth: "100%" }}
                        controls
                        playsInline
                        src={`/api/guide-media/${m.id}`}
                      />
                    )}
                    <Field label="Caption: issue / fix">
                      <input
                        maxLength={500}
                        value={m.caption}
                        onChange={(e) =>
                          setMedia((ms) =>
                            ms.map((x, j) =>
                              i === j ? { ...x, caption: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    {m.kind === "photo" && (
                      <button
                        type="button"
                        onClick={() =>
                          setPhoto({ src: `/api/photos/${m.id}`, index: i })
                        }
                      >
                        Edit photo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setMedia((ms) => ms.filter((_, j) => i !== j))
                      }
                    >
                      Remove attachment
                    </button>
                  </div>
                ))}
                {photo && (
                  <PhotoEditor
                    src={photo.src}
                    onCancel={() => setPhoto(null)}
                    onSave={async (image) => {
                      const r = await api("/api/photos", { image });
                      setMedia((ms) =>
                        photo.index < 0
                          ? [...ms, { id: r.id, kind: "photo", caption: "" }]
                          : ms.map((m, i) =>
                              i === photo.index ? { ...m, id: r.id } : m,
                            ),
                      );
                      setPhoto(null);
                    }}
                  />
                )}
                {error && <p role="alert">{error}</p>}
              </>
            )}
            <Submit busy={busy || uploading || !!photo}>
              {editing ? "Save guide changes" : "Add resource"}
            </Submit>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing("");
                  setMedia([]);
                  setPhoto(null);
                  formRef.current?.reset();
                }}
              >
                Cancel guide edit
              </button>
            )}
          </form>
        </section>
      )}
    </>
  );
}
