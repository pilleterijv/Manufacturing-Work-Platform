"use client";
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
    [playing, setPlaying] = useState("");
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
            {kind === "guide" && <p className="guide-body">{c.body}</p>}
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
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (
                await save({
                  action: kind,
                  title: f.get("title"),
                  equipmentId: f.get("equipmentId"),
                  body: f.get("body"),
                })
              )
                form.reset();
            }}
          >
            <Field label="Title">
              <input name="title" maxLength={150} required />
            </Field>
            <Field label="Equipment">
              <select name="equipmentId">
                <option value="">All equipment</option>
                {data.equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
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
            <Submit busy={busy}>Add resource</Submit>
          </form>
        </section>
      )}
    </>
  );
}
