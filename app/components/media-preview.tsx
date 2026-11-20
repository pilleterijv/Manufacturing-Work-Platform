"use client";
import { useRef, useState } from "react";

export default function MediaPreview({
  src,
  kind,
  label = "Attachment",
}: {
  src: string;
  kind: "photo" | "video";
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const inlinePlayer = useRef<HTMLVideoElement>(null);
  function open() {
    inlinePlayer.current?.pause();
    dialog.current?.showModal();
  }
  const [zoom, setZoom] = useState(false);
  function close() {
    player.current?.pause();
    dialog.current?.close();
    setZoom(false);
  }
  return (
    <>
      {kind === "photo" ? (
        <button type="button" className="media-thumbnail" aria-label={`View photo: ${label}`} onClick={open}>
          <img className="photo-preview" loading="lazy" src={src} alt={label} />
          <span>View photo →</span>
        </button>
      ) : (
        <div>
          <video
            ref={inlinePlayer}
            controls
            playsInline
            preload="metadata"
            style={{ maxWidth: "100%", maxHeight: 360 }}
            src={src}
          />
          <button type="button" onClick={open} aria-label={`View video: ${label}`}>
            View larger video →
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="media-dialog"
        aria-label={`View ${kind}: ${label}`}
        onCancel={close}
        onClose={() => {
          player.current?.pause();
          setZoom(false);
        }}
      >
        <div className="button-row media-toolbar">
          <strong>{label}</strong>
          {kind === "photo" && (
            <button type="button" onClick={() => setZoom(!zoom)}>
              {zoom ? "Fit photo" : "Zoom photo"}
            </button>
          )}
          <a href={src} target="_blank" rel="noreferrer">
            Open original ↗
          </a>
          <button type="button" onClick={close}>
            Close viewer
          </button>
        </div>
        <div className="media-stage">
          {kind === "photo" ? (
            <img className={zoom ? "media-zoom" : "media-fit"} src={src} alt={label} />
          ) : (
            <video ref={player} controls playsInline preload="metadata" className="media-fit" src={src}>
              Your browser cannot play this format. Use Open original to view or download it.
            </video>
          )}
        </div>
      </dialog>
    </>
  );
}
