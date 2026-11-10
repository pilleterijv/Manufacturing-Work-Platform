"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import {
  dashboardWidgets,
  dashboardWidgetLabels,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import { Field } from "../shared";
export default function DashboardSettings({
  saved,
}: {
  saved: (p: DashboardPreferences) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/api/dashboard-settings")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const patch = (p: Partial<DashboardPreferences>) =>
    setData((d: any) => ({ ...d, preferences: { ...d.preferences, ...p } }));
  return (
    <section className="panel">
      <h2>Personalize my dashboard</h2>
      <p>
        These choices belong to your account and follow you across devices. They
        do not change your permissions or anyone else's dashboard.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/api/dashboard-settings", {
                preferences: data.preferences,
              });
              saved(data.preferences);
              setNotice(
                "Dashboard choices saved. Your login section applies the next time you sign in or reopen the app.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Open this section when I log in">
            <select
              aria-label="Open this section when I log in"
              value={data.preferences.home}
              onChange={(e) =>
                patch({ home: e.target.value as DashboardPreferences["home"] })
              }
            >
              {data.sections
                .filter((s: string) => s !== "Dashboard settings")
                .map((s: string) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </Field>
          <Field label="Default assignment view">
            <select
              aria-label="Default assignment view"
              value={data.preferences.defaultScope}
              onChange={(e) =>
                patch({
                  defaultScope: e.target.value as "personal" | "department",
                })
              }
            >
              <option value="personal">My assignments</option>
              <option disabled={!data.canDepartment} value="department">
                Assigned department (when available)
              </option>
            </select>
          </Field>
          <fieldset className="participant-fieldset">
            <legend>Assignment panels to show</legend>
            {dashboardWidgets.map((key) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={data.preferences.widgets.includes(key)}
                  onChange={(e) =>
                    patch({
                      widgets: e.target.checked
                        ? [...data.preferences.widgets, key]
                        : data.preferences.widgets.filter(
                            (k: string) => k !== key,
                          ),
                    })
                  }
                />
                {dashboardWidgetLabels[key]}
              </label>
            ))}
          </fieldset>
          <p className="small muted">
            Selected panels appear in the order shown below.
            Permission-restricted records remain hidden.
          </p>
          {data.preferences.widgets.map(
            (key: keyof typeof dashboardWidgetLabels, i: number) => (
              <div className="button-row" key={key}>
                <span>{dashboardWidgetLabels[key]}</span>
                <button
                  type="button"
                  className="outline"
                  disabled={!i}
                  aria-label={`Move ${dashboardWidgetLabels[key]} up`}
                  onClick={() => {
                    const order = [...data.preferences.widgets];
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    patch({ widgets: order });
                  }}
                >
                  Move up
                </button>
              </div>
            ),
          )}
          {(
            [
              ["showLaunchpad", "Show workspace shortcuts"],
              ["showPerformance", "Show performance dashboard"],
              ["showHistory", "Show recent work and record totals"],
            ] as const
          ).map(([key, label]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={data.preferences[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <button className="primary" disabled={busy}>
            Save my dashboard
          </button>
        </form>
      )}
    </section>
  );
}
