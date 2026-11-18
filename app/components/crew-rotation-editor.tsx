"use client";
import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { crewWorks, plantCrewPreset } from "@/lib/crew-rotation";
export default function CrewRotationEditor({
  config,
  save,
  busy,
}: {
  config: any;
  save: (v: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [timezone, setTimezone] = useState(config.timezone);
  const [slots, setSlots] = useState<any[]>(
    config.crews?.length ? config.shifts : plantCrewPreset().shifts,
  );
  const [crews, setCrews] = useState<any[]>(
    (config.crews?.length ? config.crews : plantCrewPreset().crews).map(
      (c: any) => ({
        ...c,
        slot: String(
          (config.crews?.length
            ? config.shifts
            : plantCrewPreset().shifts
          ).findIndex((s: any) => s.name === c.shiftName),
        ),
      }),
    ),
  );
  const patch = (i: number, v: any) =>
    setCrews((old) => old.map((c, n) => (n === i ? { ...c, ...v } : c)));
  const ready = crews.every((c) => c.anchorDate && ["0", "1"].includes(c.slot));
  const preview = ready
    ? Array.from({ length: 14 }, (_, i) =>
        Temporal.PlainDate.from(crews[0].anchorDate)
          .add({ days: i })
          .toString(),
      )
    : [];
  function usePlantRoster() {
    const p = plantCrewPreset();
    setSlots(p.shifts);
    setCrews(
      p.crews.map((c) => ({ ...c, slot: c.shiftName === "Day" ? "0" : "1" })),
    );
  }
  return (
    <details className="panel">
      <summary>Configure rotating crews and 12-hour shift times</summary>
      <p>
        Configure crews 4–7 once, then assign each requirement to a crew and
        named people. An anchor date is day 1 of that crew’s repeating pattern.
        A night shift belongs to the date it starts. Review the preview against
        your roster before saving.
      </p>
      <button type="button" className="outline" onClick={usePlantRoster}>
        Use plant roster: crews 4/7 and 5/6 · 5:30 starts
      </button>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await save({
            action: "configureCrews",
            config: {
              ...config,
              timezone,
              shifts: slots,
              crews: crews.map(({ slot, ...c }) => ({
                ...c,
                shiftName: slots[Number(slot)].name,
              })),
            },
          });
        }}
      >
        <label className="field">
          <span>Plant time zone</span>
          <input
            aria-label="Plant time zone"
            required
            maxLength={100}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
        <div className="form-grid">
          {slots.map((s, i) => (
            <fieldset key={i}>
              <legend>12-hour time slot {i + 1}</legend>
              <label className="field">
                <span>Time slot name {i + 1}</span>
                <input
                  required
                  maxLength={50}
                  value={s.name}
                  onChange={(e) =>
                    setSlots((old) =>
                      old.map((x, n) =>
                        n === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Time slot start {i + 1}</span>
                <input
                  required
                  type="time"
                  value={`${String(Math.floor(s.startMinute / 60)).padStart(2, "0")}:${String(s.startMinute % 60).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    setSlots((old) =>
                      old.map((x, n) =>
                        n === i ? { ...x, startMinute: h * 60 + m } : x,
                      ),
                    );
                  }}
                />
              </label>
            </fieldset>
          ))}
        </div>
        {crews.map((c, i) => (
          <fieldset key={i}>
            <legend>{c.name}</legend>
            <div className="form-grid">
              <label className="field">
                <span>{c.name} time slot</span>
                <select
                  required
                  value={c.slot}
                  onChange={(e) => patch(i, { slot: e.target.value })}
                >
                  <option value="">Choose day/night time slot</option>
                  {slots.map((s, n) => (
                    <option key={n} value={String(n)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{c.name} cycle starts</span>
                <input
                  required
                  type="date"
                  value={c.anchorDate}
                  onChange={(e) => patch(i, { anchorDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{c.name} cycle length</span>
                <input
                  required
                  type="number"
                  min={2}
                  max={28}
                  value={c.workingDays.length}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 2 && n <= 28)
                      patch(i, {
                        workingDays: Array.from(
                          { length: n },
                          (_, j) => c.workingDays[j] ?? false,
                        ),
                      });
                  }}
                />
              </label>
            </div>
            <div className="participant-picker">
              {c.workingDays.map((on: boolean, d: number) => (
                <label className="participant-option" key={d}>
                  <input
                    type="checkbox"
                    aria-label={`${c.name} cycle day ${d + 1}`}
                    checked={on}
                    onChange={(e) =>
                      patch(i, {
                        workingDays: c.workingDays.map(
                          (v: boolean, j: number) =>
                            j === d ? e.target.checked : v,
                        ),
                      })
                    }
                  />
                  Day {d + 1}: {on ? "On" : "Off"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p>
          Use the plant roster preset for the confirmed 14-day 2-2-3 pattern.
          November 18–19, 2026: Shift 5 days / Shift 6 nights. November 20–22:
          Shift 4 days / Shift 7 nights. Review the preview and save before
          creating crew requirements.
        </p>
        {preview.length > 0 && (
          <div className="history">
            <table>
              <caption>
                Roster preview — starting at the first crew’s anchor date
              </caption>
              <thead>
                <tr>
                  <th>Date</th>
                  {slots.map((s, i) => (
                    <th key={i}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((date) => (
                  <tr key={date}>
                    <td>{date}</td>
                    {slots.map((_, i) => (
                      <td key={i}>
                        {crews
                          .filter(
                            (c) => c.slot === String(i) && crewWorks(c, date),
                          )
                          .map((c) => c.name)
                          .join(", ") || "No crew scheduled"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="primary" disabled={busy}>
          Save shift times and crew rotations
        </button>
        <p>
          Existing requirements keep their original schedule snapshot. Replace
          or pause old weekday requirements after reviewing them; this save does
          not rewrite past completions or alerts.
        </p>
      </form>
    </details>
  );
}
