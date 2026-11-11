"use client";
export type LeaderHandoffData = {
  shift: string;
  notes: string;
  rooms: {
    room: string;
    item: string;
    lot: string;
    targetSpeed: string;
    actualSpeed: string;
    remaining: string;
    issues: string;
    nextOrder: "" | "Yes" | "No" | "Not applicable";
  }[];
};
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
export default function LeaderHandoff({
  value,
  onChange,
  shifts,
}: {
  value: LeaderHandoffData;
  onChange: (v: LeaderHandoffData) => void;
  shifts: string[];
}) {
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
      {value.rooms.map((r, i) => (
        <fieldset key={i}>
          <legend>{r.room || `Room / machine ${i + 1}`}</legend>
          <div className="form-grid">
            {(
              [
                ["room", "Room / machine"],
                ["item", "Item number"],
                ["lot", "Lot number"],
                ["targetSpeed", "Target speed"],
                ["actualSpeed", "Actual speed"],
                ["remaining", "Bags / bins until minor or major clean"],
                ["issues", "Issues and root-cause findings"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                <span>
                  {label} · row {i + 1}
                </span>
                <input
                  maxLength={
                    key === "issues"
                      ? 2000
                      : key === "remaining"
                        ? 150
                        : key === "targetSpeed" || key === "actualSpeed"
                          ? 40
                          : 100
                  }
                  value={r[key]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      rooms: value.rooms.map((old, index) =>
                        index === i ? { ...old, [key]: e.target.value } : old,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label className="field">
              <span>Next order blended / ready · row {i + 1}</span>
              <select
                value={r.nextOrder}
                onChange={(e) =>
                  onChange({
                    ...value,
                    rooms: value.rooms.map((old, index) =>
                      index === i
                        ? {
                            ...old,
                            nextOrder: e.target.value as typeof r.nextOrder,
                          }
                        : old,
                    ),
                  })
                }
              >
                {["", "Yes", "No", "Not applicable"].map((v) => (
                  <option key={v} value={v}>
                    {v || "Choose"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="outline"
            onClick={() =>
              onChange({
                ...value,
                rooms: value.rooms.filter((_, index) => index !== i),
              })
            }
          >
            Remove this handoff row
          </button>
        </fieldset>
      ))}
    </section>
  );
}
