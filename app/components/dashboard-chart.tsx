"use client";
import { useId, useState } from "react";
const colors = [
  "#c54900",
  "#e88225",
  "#236976",
  "#577c35",
  "#845b88",
  "#946b25",
];
export default function DashboardChart({
  title,
  items,
  note,
}: {
  title: string;
  items: { label: string; count: number }[];
  note: string;
}) {
  const id = useId(),
    [view, setView] = useState("bar");
  const rows = items.map((x) => ({
    ...x,
    count: Number.isFinite(x.count) ? Math.max(0, x.count) : 0,
  }));
  const max = Math.max(1, ...rows.map((x) => x.count)),
    total = rows.reduce((n, x) => n + x.count, 0);
  let offset = 0;
  return (
    <section className="panel dashboard-chart" aria-label={title}>
      <div className="section-title">
        <h3 id={id}>{title}</h3>
        <label>
          Chart view{" "}
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="bar">Bar chart</option>
            <option value="donut">Donut chart</option>
            <option value="table">Data table</option>
          </select>
        </label>
      </div>
      {!total ? (
        <p>No matching values to chart yet.</p>
      ) : view === "bar" ? (
        <div>
          {rows.map((r, i) => (
            <div className="chart-bar-row" key={r.label}>
              <span>{r.label}</span>
              <svg
                viewBox="0 0 300 24"
                role="img"
                aria-label={`${r.label}: ${r.count}`}
              >
                <rect width={300} height={24} rx={4} fill="#f4ece5" />
                <rect
                  width={(300 * r.count) / max}
                  height={24}
                  rx={4}
                  fill={colors[i % colors.length]}
                />
              </svg>
              <strong>{r.count}</strong>
            </div>
          ))}
        </div>
      ) : view === "donut" ? (
        <div className="donut-layout">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={rows.map((r) => `${r.label}: ${r.count}`).join(", ")}
          >
            <circle
              cx="60"
              cy="60"
              r="44"
              fill="none"
              stroke="#f4ece5"
              strokeWidth="18"
            />
            {rows
              .filter((r) => r.count > 0)
              .map((r, i) => {
                const length = (r.count / total) * 100,
                  start = offset;
                offset += length;
                return (
                  <circle
                    key={r.label}
                    cx="60"
                    cy="60"
                    r="44"
                    pathLength="100"
                    fill="none"
                    stroke={colors[rows.indexOf(r) % colors.length]}
                    strokeWidth="18"
                    strokeDasharray={`${length} ${100 - length}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 60 60)"
                  />
                );
              })}
            <text
              x="60"
              y="64"
              textAnchor="middle"
              fontSize="14"
              fill="currentColor"
            >
              {total}
            </text>
          </svg>
          <ul>
            {rows.map((r, i) => (
              <li key={r.label}>
                <span style={{ color: colors[i % colors.length] }}>●</span>{" "}
                {r.label}: <strong>{r.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(view === "table" || !total) && (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted">{note}</p>
    </section>
  );
}
