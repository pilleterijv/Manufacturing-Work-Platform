"use client";
import SectionFiltersBar from "./components/section-filters";
import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import type { User, Data } from "@/lib/workspace-types";
import type { Capability } from "@/lib/rules";
import {
  api,
  filterUrl,
  getSectionFilters,
  setSectionFilters,
  type SectionFilters,
} from "@/lib/client-api";
import { Field, Submit, HistoryPagingContext } from "./components/shared";
import { emptyOperations, type OperationsData } from "@/lib/operations-types";
const Maintenance = dynamic(() => import("./components/sections/maintenance"));
const Reminders = dynamic(() => import("./components/sections/reminders"));
const ExternalData = dynamic(() => import("./components/external-data"));
const Overview = dynamic(() => import("./components/sections/overview"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Problems = dynamic(() => import("./components/sections/problems"), {
  loading: () => <p className="muted">Loading problem solving…</p>,
});
const ShiftSchedules = dynamic(
  () => import("./components/sections/shift-schedules"),
);
const Integrations = dynamic(
  () => import("./components/sections/integrations"),
);
const Work = dynamic(() => import("./components/sections/work"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Studies = dynamic(() => import("./components/sections/studies"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Content = dynamic(() => import("./components/sections/content"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Manage = dynamic(() => import("./components/sections/manage"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Analytics = dynamic(() => import("./components/sections/analytics"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Permissions = dynamic(() => import("./components/sections/permissions"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Accounts = dynamic(() => import("./components/sections/accounts"), {
  loading: () => <p className="muted">Loading section…</p>,
});
const Downtime = dynamic(
  () => import("./components/operations").then((m) => m.Downtime),
  { loading: () => <p className="muted">Loading section…</p> },
);
const ImprovementIdeas = dynamic(
  () => import("./components/operations").then((m) => m.ImprovementIdeas),
  { loading: () => <p className="muted">Loading section…</p> },
);
const Notifications = dynamic(
  () => import("./components/operations").then((m) => m.Notifications),
  { loading: () => <p className="muted">Loading section…</p> },
);
const Leadership = dynamic(
  () => import("./components/operations").then((m) => m.Leadership),
  { loading: () => <p className="muted">Loading section…</p> },
);

const platformViews: Record<string, string> = {
  Overview: "overview",
  "Standard work": "work",
  "DL/TL Standard Work": "audits",
  "Time studies": "studies",
  Training: "training",
  Troubleshooting: "guides",
  Manage: "manage",
  Accounts: "users",
  Permissions: "policies",
  Analytics: "analytics",
};
const platformUrl = (tab: string) =>
  "/api/platform?view=" + (platformViews[tab] ?? "equipment");
const operationsView = (tab: string) =>
  tab === "Downtime"
    ? "downtime"
    : tab === "Improvement ideas"
      ? "ideas"
      : "summary";
const empty: Data = {
  equipment: [],
  standards: [],
  records: [],
  content: [],
  users: [],
  policies: [],
};
export default function Home() {
  const [filters, setFilters] = useState<SectionFilters>({
    person: "",
    search: "",
  });
  const [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false),
    [data, setData] = useState<Data>(empty),
    [operations, setOperations] = useState<OperationsData>(emptyOperations),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [operationsReady, setOperationsReady] = useState(false),
    [platformReady, setPlatformReady] = useState(false),
    [platformTab, setPlatformTab] = useState(""),
    [opsDepartment, setOpsDepartment] = useState(""),
    [opsLoading, setOpsLoading] = useState(false),
    [loadingMore, setLoadingMore] = useState(false);
  const refreshEpoch = useRef(0),
    currentView = useRef(tab);
  currentView.current = tab;
  async function refresh() {
    const epoch = ++refreshEpoch.current,
      requestedTab = tab,
      filterKey = JSON.stringify(getSectionFilters());
    const account = await api("/api/account");
    if (epoch !== refreshEpoch.current) return;
    setUser(account.user);
    if (account.user && !account.user.mustChange) {
      const [platform, ops] = await Promise.all([
        api(platformUrl(tab)),
        api(
          "/api/operations?" +
            new URLSearchParams({
              view: operationsView(tab),
              department: opsDepartment,
            }),
        ),
      ]);
      if (
        epoch !== refreshEpoch.current ||
        requestedTab !== currentView.current ||
        filterKey !== JSON.stringify(getSectionFilters())
      ) {
        setLoaded(true);
        return;
      }
      setData(platform);
      setPlatformTab(tab);
      setPlatformReady(true);
      setOperations({ ...emptyOperations, ...ops });
      setOperationsReady(["Downtime", "Improvement ideas"].includes(tab));
    } else {
      setData(empty);
      setOperations(emptyOperations);
      setOperationsReady(false);
      setPlatformReady(false);
    }
    setLoaded(true);
  }
  useEffect(() => {
    refresh().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
  }, []);
  async function save(body: unknown, path = "/api/platform") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      await refresh();
      setNotice("Saved to the database.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const opsGeneration = useRef(0),
    historyGeneration = useRef(0);
  useEffect(() => {
    opsGeneration.current++;
    historyGeneration.current++;
    setOpsLoading(false);
    setLoadingMore(false);
  }, [tab, opsDepartment, filters]);
  async function loadMoreOperations() {
    const generation = opsGeneration.current;
    const page =
      tab === "Downtime" ? operations.downtimePage : operations.ideasPage;
    if (!page?.hasMore || opsLoading) return;
    setOpsLoading(true);
    try {
      const next = await api(
        "/api/operations?" +
          new URLSearchParams({
            view: operationsView(tab),
            department: opsDepartment,
            cursor: page.cursor ?? "",
          }),
      );
      if (generation !== opsGeneration.current) return;
      setOperations((prev) => ({
        ...prev,
        downtime: [
          ...new Map(
            [...prev.downtime, ...next.downtime].map((d) => [d.id, d]),
          ).values(),
        ],
        ideas: [
          ...new Map(
            [...prev.ideas, ...next.ideas].map((i) => [i.id, i]),
          ).values(),
        ],
        downtimePage: next.downtimePage,
        ideasPage: next.ideasPage,
      }));
    } catch (e) {
      if (generation === opsGeneration.current) setError((e as Error).message);
    } finally {
      setOpsLoading(false);
    }
  }
  async function loadMore() {
    const generation = historyGeneration.current;
    if (!data.page?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api(
        "/api/platform?view=records&kind=" +
          encodeURIComponent(platformViews[tab] ?? "") +
          "&cursor=" +
          encodeURIComponent(data.page.cursor ?? ""),
      );
      if (generation !== historyGeneration.current) return;
      setData((prev) => ({
        ...prev,
        records: [
          ...new Map(
            [...prev.records, ...next.records].map((r) => [r.id, r]),
          ).values(),
        ],
        page: next.page,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (generation === historyGeneration.current) setLoadingMore(false);
    }
  }
  async function account(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/account", body);
      setSectionFilters({ person: "", search: "" });
      setFilters({ person: "", search: "" });
      await refresh();
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!loaded || !user || user.mustChange) return;
    const controller = new AbortController();
    let pending = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const live = tab === "Downtime",
          next = await api(
            "/api/operations?" +
              new URLSearchParams({
                view: live ? "live" : "summary",
                department: opsDepartment,
              }),
            undefined,
            controller.signal,
          );
        if (controller.signal.aborted) return;
        setOperations((prev) => ({
          ...prev,
          config: next.config,
          notifications: next.notifications,
          serverNow: next.serverNow,
          ...(live
            ? {
                equipment: next.equipment,
                downtime: [
                  ...next.active,
                  ...prev.downtime.filter(
                    (d) =>
                      d.endedAt &&
                      next.equipment.some(
                        (e: { id: string }) => e.id === d.equipmentId,
                      ),
                  ),
                ],
              }
            : {}),
        }));
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(poll, tab === "Downtime" ? 5000 : 20000);
    const visible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [loaded, user?.id, user?.mustChange, tab, opsDepartment, filters]);
  useEffect(() => {
    if (!loaded || !user || user.mustChange) return;
    const controller = new AbortController();
    if (["Downtime", "Improvement ideas"].includes(tab)) {
      setOperationsReady(false);
      api(
        "/api/operations?" +
          new URLSearchParams({
            view: operationsView(tab),
            department: opsDepartment,
          }),
        undefined,
        controller.signal,
      )
        .then((next) => {
          if (!controller.signal.aborted) {
            setOperations({ ...emptyOperations, ...next });
            setOperationsReady(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }
    return () => controller.abort();
  }, [loaded, tab, user?.id, user?.mustChange, opsDepartment, filters]);
  useEffect(() => {
    if (
      !loaded ||
      !user ||
      user.mustChange ||
      (platformReady && platformTab === tab) ||
      ["Notifications", "Leadership dashboard", "My account"].includes(tab)
    )
      return;
    const controller = new AbortController();
    setPlatformReady(false);
    api(platformUrl(tab), undefined, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setData({ ...empty, ...next });
          setPlatformTab(tab);
          setPlatformReady(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [
    loaded,
    tab,
    user?.id,
    user?.mustChange,
    platformReady,
    platformTab,
    filters,
  ]);
  const sectionReady = platformReady && platformTab === tab;
  if (!loaded) return <main className="loading">Opening Floorwork…</main>;
  if (!user || user.mustChange)
    return (
      <main className="auth">
        <section className="auth-story">
          <div className="brand">
            ▦{" "}
            <span>
              floorwork<span className="brand-dot">.</span>
            </span>
          </div>
          <span className="eyebrow">A BETTER DAY ON THE FLOOR</span>
          <h1>
            Good work.
            <br />
            Made repeatable.
          </h1>
          <p>
            Clear standards. Confident teams.
            <br />
            Every improvement starts with one observation.
          </p>
          <div className="auth-lines">
            <span>01 &nbsp; Follow the standard</span>
            <span>02 &nbsp; Capture the evidence</span>
            <span>03 &nbsp; Improve the process</span>
          </div>
        </section>
        <section className="auth-form">
          <span className="eyebrow">YOUR MANUFACTURING WORKSPACE</span>
          <h2>{user ? "Set your own password" : "Welcome back"}</h2>
          <p className="muted">
            {user
              ? "Replace your temporary password. You will then sign in again."
              : "Sign in with your individual account."}
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void account(
                user
                  ? {
                      action: "password",
                      current: f.get("current"),
                      password: f.get("password"),
                    }
                  : {
                      action: "login",
                      username: f.get("username"),
                      password: f.get("password"),
                      remember: f.get("remember") === "on",
                    },
              );
            }}
          >
            {!user ? (
              <Field label="Username">
                <input name="username" autoComplete="username" required />
              </Field>
            ) : (
              <Field label="Temporary password">
                <input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
            )}
            <Field
              label={user ? "New password · 12–128 characters" : "Password"}
            >
              <input
                name="password"
                type="password"
                minLength={user ? 12 : undefined}
                maxLength={128}
                autoComplete={user ? "new-password" : "current-password"}
                required
              />
            </Field>
            {!user && (
              <label className="check">
                <input type="checkbox" name="remember" />
                Keep me signed in on this device for 30 days
              </label>
            )}
            <Submit busy={busy}>{user ? "Set password" : "Sign in →"}</Submit>
          </form>
          <p className="small muted">
            {user
              ? "All existing sessions will be signed out."
              : "Need access? Ask your administrator to create an account."}
          </p>
        </section>
      </main>
    );
  const g = user.grants;
  const nav: [string, Capability | null, string][] = [
    ["Overview", null, "◫"],
    ["Standard work", "work", "☑"],
    ["Time studies", "studies", "◷"],
    ["Preventive maintenance", "maintenance", "⚒"],
    ["Production results", "analytics", "▥"],
    ["DL/TL Standard Work", "audits", "◎"],
    ["Training", null, "▷"],
    ["Troubleshooting", null, "◇"],
    ["Analytics", "analytics", "▥"],
    ["Downtime", "downtime", "◷"],
    ["Leadership dashboard", "leadership", "◫"],
    ["Improvement ideas", "ideas", "✧"],
    ["Problem solving", "problems", "◈"],
    ["Notifications", null, "✉"],
    ["Manage", "manage", "⊞"],
    ["Shift requirements", "manage", "◷"],
    ["Accounts", "users", "♙"],
    ["Permissions", "permissions", "⚙"],
    ["My account", null, "○"],
  ];
  if (user.role === "Admin") nav.push(["Integrations", null, "⇄"]);
  const descriptions: Record<string, string> = {
    "Problem solving":
      "Structured 2D, 4D and 8D investigations, actions and effectiveness checks.",
    Downtime:
      "Track stoppages, understand shift losses, and keep the floor moving.",
    "Leadership dashboard":
      "One view across operations, with a department-level lens.",
    "Improvement ideas":
      "Turn floor-level observations into owned, validated improvements.",
    Notifications: "Your assignments and messages, in one place.",
    Overview: "A clear view of the work that moves your floor forward.",
    "Standard work":
      "Follow each step. Verify the result. Capture the evidence.",
    "Time studies": "Observe the process and turn raw timing into insight.",
    "DL/TL Standard Work":
      "Verify the standard and measure actual operator cycle times.",
    Training: "Practical know-how, ready when your team needs it.",
    Troubleshooting: "Find the guidance to get your process back on track.",
    Analytics: "Understand variation, spot failures, and track performance.",
    Manage: "Build equipment, standards, and guides for your team.",
    "Shift requirements":
      "Schedule standard work and switch manager alert channels on or off.",
    Integrations: "Map factory systems and monitor automated machine events.",
    Accounts: "Individual access, with accountability built in.",
    Permissions: "Choose what each role can do across the platform.",
    "My account": "Manage your password and your signed-in devices.",
  };
  return (
    <HistoryPagingContext.Provider
      value={{
        loadMore,
        loading: loadingMore,
        hasMore: data.page?.hasMore ?? false,
      }}
    >
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            ▦{" "}
            <span>
              floorwork<span className="brand-dot">.</span>
            </span>
          </div>
          <div className="workspace">
            <i /> Manufacturing workspace<span>OPERATIONS PLATFORM</span>
          </div>
          <span className="nav-label">WORKSPACE</span>
          <nav>
            {nav
              .filter(
                ([, c]) =>
                  (!c || g.includes(c)) &&
                  (!(c === "users" || c === "permissions") ||
                    user.role === "Admin"),
              )
              .map(([name, , icon]) => (
                <button
                  key={name}
                  className={tab === name ? "nav-item active" : "nav-item"}
                  onClick={() => {
                    setTab(name);
                    setOpsDepartment("");
                    setError("");
                    setNotice("");
                  }}
                >
                  <span>{icon}</span>
                  {name}
                  {name === "Notifications" &&
                    operations.notifications.some((n) => !n.readAt) && (
                      <span className="notification-count">
                        {
                          operations.notifications.filter((n) => !n.readAt)
                            .length
                        }
                      </span>
                    )}
                  {tab === name && <b>•</b>}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <button
              aria-label="Sign out"
              onClick={() => void account({ action: "logout" })}
            >
              →
            </button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <span>
              Workspace <span className="muted"> / {tab}</span>
            </span>
            <span className="status">
              <i /> Database connected{" "}
              <span className="role-tag">{user.role}</span>
            </span>
          </header>
          <div className="page" key={filters.person + ":" + filters.search}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">FLOORWORK / OPERATIONS</span>
                <h1>
                  {tab === "Overview"
                    ? `Welcome, ${user.name.split(" ")[0]}.`
                    : tab}
                </h1>
                <p className="muted">{descriptions[tab]}</p>
              </div>
              {g.includes("export") && (
                <a
                  className="outline"
                  href={filterUrl(
                    tab === "Preventive maintenance"
                      ? "/api/maintenance?format=xlsx"
                      : tab === "Production results"
                        ? "/api/external-data?section=Production%20results&format=xlsx"
                        : tab === "Problem solving"
                          ? "/api/problems?format=xlsx"
                          : "/api/export",
                  )}
                >
                  ↓ Export Excel
                </a>
              )}
            </div>
            <SectionFiltersBar
              value={filters}
              onApply={(value) => {
                opsGeneration.current++;
                historyGeneration.current++;
                refreshEpoch.current++;
                setSectionFilters(value);
                setFilters(value);
                setPlatformReady(false);
                setPlatformTab("");
                setData(empty);
                setOperationsReady(false);
                setOperations(emptyOperations);
              }}
            />
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                ✓ {notice}
              </div>
            )}
            {((["Downtime", "Improvement ideas"].includes(tab) &&
              !operationsReady) ||
              (![
                "Overview",
                "Notifications",
                "Leadership dashboard",
                "My account",
                "Downtime",
                "Improvement ideas",
              ].includes(tab) &&
                !sectionReady)) && (
              <p className="muted" role="status">
                Loading section data…
              </p>
            )}
            {tab === "Overview" && (
              <Overview
                data={data}
                go={setTab}
                grants={g}
                admin={user.role === "Admin"}
              >
                {(g.includes("dashboard") || g.includes("leadership")) && (
                  <Leadership
                    timezone={operations.config.timezone}
                    canExport={g.includes("export")}
                    endpoint="/api/dashboard"
                    canOverall={g.includes("leadership")}
                  />
                )}
              </Overview>
            )}
            {tab === "Problem solving" && (
              <Problems
                userId={user.id}
                userName={user.name}
                canExport={g.includes("export")}
              />
            )}
            {tab === "Standard work" && sectionReady && (
              <Work data={data} save={save} busy={busy} audit={false} />
            )}
            {tab === "DL/TL Standard Work" && sectionReady && (
              <Work data={data} save={save} busy={busy} audit />
            )}
            {tab === "Time studies" && sectionReady && (
              <Studies data={data} save={save} busy={busy} />
            )}
            {tab === "Training" && sectionReady && (
              <Content
                data={data}
                kind="video"
                manage={g.includes("training")}
                save={save}
                busy={busy}
              />
            )}
            {tab === "Troubleshooting" && sectionReady && (
              <Content
                data={data}
                kind="guide"
                manage={g.includes("manage")}
                save={save}
                busy={busy}
              />
            )}
            {tab === "Downtime" && operationsReady && (
              <Downtime
                data={operations}
                equipment={operations.equipment}
                admin={user.role === "Admin"}
                department={opsDepartment}
                onDepartment={setOpsDepartment}
                loadMore={loadMoreOperations}
                loadingMore={opsLoading}
                save={(b) => save(b, "/api/operations")}
                busy={busy}
              />
            )}
            {tab === "Improvement ideas" && operationsReady && (
              <ImprovementIdeas
                data={operations}
                equipment={data.equipment}
                userId={user.id}
                admin={user.role === "Admin"}
                department={opsDepartment}
                onDepartment={setOpsDepartment}
                loadMore={loadMoreOperations}
                loadingMore={opsLoading}
                save={(b) => save(b, "/api/operations")}
                busy={busy}
              />
            )}
            {tab === "Preventive maintenance" && (
              <Maintenance userId={user.id} admin={user.role === "Admin"} />
            )}
            {tab === "Notifications" && (
              <Reminders admin={user.role === "Admin"} />
            )}
            {tab === "Notifications" && (
              <Notifications
                data={operations}
                save={(b) => save(b, "/api/operations")}
                busy={busy}
                openIdea={() => setTab("Improvement ideas")}
                openWork={() => setTab("Standard work")}
                openProblem={() => setTab("Problem solving")}
                openMaintenance={() => setTab("Preventive maintenance")}
              />
            )}
            {tab === "Leadership dashboard" && (
              <Leadership
                timezone={operations.config.timezone}
                canExport={g.includes("export")}
              />
            )}
            {tab === "Shift requirements" && g.includes("manage") && (
              <ShiftSchedules />
            )}
            {tab === "Integrations" && user.role === "Admin" && (
              <Integrations />
            )}
            {tab === "Manage" && sectionReady && (
              <Manage data={data} save={save} busy={busy} />
            )}
            {tab === "Analytics" && sectionReady && <Analytics data={data} />}
            {tab === "Permissions" && sectionReady && (
              <Permissions data={data} save={save} busy={busy} />
            )}
            {tab === "Accounts" && sectionReady && (
              <Accounts
                data={data}
                save={save}
                busy={busy}
                admin={user.role === "Admin"}
              />
            )}
            {[
              "Overview",
              "Standard work",
              "DL/TL Standard Work",
              "Time studies",
              "Training",
              "Troubleshooting",
              "Analytics",
              "Downtime",
              "Leadership dashboard",
              "Improvement ideas",
              "Problem solving",
              "Preventive maintenance",
              "Production results",
              "Shift requirements",
            ].includes(tab) && (
              <ExternalData
                section={tab}
                admin={user.role === "Admin"}
                canImport={g.includes("manage")}
                canExport={g.includes("export")}
              />
            )}
            {tab === "My account" && (
              <section className="panel narrow">
                <h2>Change password</h2>
                <p className="muted">
                  Changing your password signs out every device.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void account({
                      action: "password",
                      current: f.get("current"),
                      password: f.get("password"),
                    });
                  }}
                >
                  <Field label="Current password">
                    <input
                      name="current"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                  <Field label="New password">
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                  <Submit busy={busy}>Change password</Submit>
                </form>
                <hr />
                <button
                  className="outline"
                  onClick={() => void account({ action: "logoutAll" })}
                >
                  Sign out all devices
                </button>
              </section>
            )}
            <footer>
              FLOORWORK <span>Built for the people behind the process.</span>
            </footer>
          </div>
        </main>
      </div>
    </HistoryPagingContext.Provider>
  );
}
