"use client";
import type { LeaderHandoffData } from "@/lib/leader-handoff-rules";
export type { LeaderHandoffData } from "@/lib/leader-handoff-rules";
const room = (i: number) => ({
  room: `Room ${i}`,
  item: "",
  lot: "",
  targetSpeed: "",
  actualSpeed: "",
  remaining: "",
  issues: "",
  nextOrder: "" as const,
});
type Row = LeaderHandoffData["rooms"][number];
export default function LeaderHandoff({
  value,
  onChange,
  shifts,
  profile = "generic",
}: {
  value: LeaderHandoffData;
  onChange: (v: LeaderHandoffData) => void;
  shifts: string[];
  profile?: string;
}) {
  const update = (i: number, key: keyof Row, text: string) =>
    onChange({
      ...value,
      rooms: value.rooms.map((r, n) => (n === i ? { ...r, [key]: text } : r)),
    });
  return (
    <section className="panel">
      <h3>Shift handoff and room / machine notes</h3>
      <label className="field">
        <span>Leader-work shift</span>
        <select
          aria-label="Leader-work shift"
          required
          value={value.shift}
          onChange={(e) => onChange({ ...value, shift: e.target.value })}
        >
          <option value="">Choose shift</option>
          {shifts.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Leader pass-down notes</span>
        <textarea
          aria-label="Leader pass-down notes"
          value={value.notes}
          maxLength={10000}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      {profile === "generic" && (
        <div className="button-row">
          <button
            className="outline"
            type="button"
            disabled={value.rooms.length >= 30}
            onClick={() =>
              onChange({
                ...value,
                rooms: [...value.rooms, room(value.rooms.length + 1)],
              })
            }
          >
            Add room / machine handoff
          </button>
          {!value.rooms.length && (
            <button
              className="outline"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  rooms: Array.from({ length: 10 }, (_, i) => room(i + 1)),
                })
              }
            >
              Use ten-room compressing handoff
            </button>
          )}
        </div>
      )}
      {value.rooms.map((r, i) => {
        const textFields: [keyof Row, string, number][] = [
          ["room", "Room / machine", 100],
          ["item", "Item number", 100],
          ["lot", "Lot number", 100],
        ];
        const choices: [keyof Row, string][] = [];
        if (["generic", "compressing"].includes(profile)) {
          textFields.push(
            ["targetSpeed", "Target speed", 40],
            ["actualSpeed", "Actual speed", 40],
            ["remaining", "Bags / bins until minor or major clean", 150],
          );
          choices.push(["nextOrder", "Next order blended / ready"]);
        }
        if (profile === "blending") {
          textFields.push(["status", "Work order status", 150]);
          choices.push(
            ["nextOrder", "Next order ready"],
            ["materialsSplit", "Materials split correctly"],
          );
        }
        if (profile === "weigh-room") {
          if (r.room.startsWith("Weigh Room"))
            textFields.push(["weighsLeft", "Number of weighs left", 40]);
          if (r.room === "Bin Blending")
            textFields.push(["cleanBins", "Number of clean bins", 40]);
          if (r.room === "Inspection") {
            textFields.push(
              ["inspectingFor", "What are we inspecting for?", 500],
              ["status", "Status of work order", 150],
            );
            choices.push(
              [
                "requiresYielding",
                "Do totes require charging / yielding in DSI?",
              ],
              ["yielded", "Have totes been yielded?"],
            );
          }
        }
        if (profile === "coating") {
          if (r.room.startsWith("CC"))
            textFields.push([
              "remaining",
              "Totes until minor / major clean",
              150,
            ]);
          if (r.room.startsWith("AC")) {
            textFields.push(
              ["round", "Current round", 40],
              ["totalRounds", "Total rounds", 40],
            );
            choices.push([
              "lastFourRecalculated",
              "Last four rounds recalculated",
            ]);
          }
          choices.push(
            ["solutionMixed", "Solution mixed for current work order"],
            ["nextSolutionReady", "Next order solution staged / picked / made"],
          );
        }
        textFields.push(["issues", "Issues and root-cause findings", 2000]);
        return (
          <fieldset key={i}>
            <legend>{r.room || `Room / machine ${i + 1}`}</legend>
            <div className="form-grid">
              {textFields.map(([key, label, max]) => (
                <label className="field" key={key}>
                  <span>
                    {label} · row {i + 1}
                  </span>
                  <input
                    maxLength={max}
                    readOnly={profile !== "generic" && key === "room"}
                    value={r[key] || ""}
                    onChange={(e) => update(i, key, e.target.value)}
                  />
                </label>
              ))}
              {choices.map(([key, label]) => (
                <label className="field" key={key}>
                  <span>
                    {label} · row {i + 1}
                  </span>
                  <select
                    value={r[key] || ""}
                    onChange={(e) => update(i, key, e.target.value)}
                  >
                    {["", "Yes", "No", "Not applicable"].map((v) => (
                      <option key={v} value={v}>
                        {v || "Choose"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {profile === "generic" && (
              <button
                className="outline"
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    rooms: value.rooms.filter((_, n) => n !== i),
                  })
                }
              >
                Remove this handoff row
              </button>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
