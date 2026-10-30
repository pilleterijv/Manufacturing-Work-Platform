"use client";
import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import type { User, Data } from "@/lib/workspace-types";
import type { Capability } from "@/lib/rules";
import { api } from "@/lib/client-api";
import { Field, Submit } from "./components/shared";
import { emptyOperations, type OperationsData } from "@/lib/operations-types";
const Overview = dynamic(() => import("./components/sections/overview"), {
  loading: () => <p className="muted">Loading section…</p>,
});
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

const empty: Data = {
  equipment: [],
  standards: [],
  records: [],
  content: [],
  users: [],
  policies: [],
};
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false),
    [data, setData] = useState<Data>(empty),
    [operations, setOperations] = useState<OperationsData>(emptyOperations),
    [tab, setTab] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [operationsReady, setOperationsReady] = useState(false),
    [platformReady, setPlatformReady] = useState(false);
  async function refresh() {
    const account = await api("/api/account");
    setUser(account.user);
    if (account.user && !account.user.mustChange) {
      const [platform, ops] = await Promise.all([
        api("/api/platform" + (tab === "Overview" ? "?view=overview" : "")),
        api(
          "/api/operations" +
            (["Downtime", "Improvement ideas"].includes(tab)
              ? ""
              : "?view=summary"),
        ),
      ]);
      setData(platform);
      setPlatformReady(tab !== "Overview");
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
  async function account(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/account", body);
      await refresh();
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!user || user.mustChange) return;
    const controller = new AbortController();
    let pending = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const live = tab === "Downtime",
          next = await api(
            "/api/operations?view=" + (live ? "live" : "summary"),
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
                downtime: [
                  ...next.active,
                  ...prev.downtime.filter((d) => d.endedAt),
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
    const timer = setInterval(poll, 20000);
    const visible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id, user?.mustChange, tab]);
  useEffect(() => {
    if (!user || user.mustChange) return;
    const controller = new AbortController();
    if (["Downtime", "Improvement ideas"].includes(tab)) {
      setOperationsReady(false);
      api("/api/operations", undefined, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setOperations(next);
            setOperationsReady(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }
    if (
      !platformReady &&
      !["Overview", "Notifications", "Leadership dashboard"].includes(tab)
    )
      api("/api/platform", undefined, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setData(next);
            setPlatformReady(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [tab, user?.id, user?.mustChange, platformReady]);
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
    ["Supervisor audits", "audits", "◎"],
    ["Training", null, "▷"],
    ["Troubleshooting", null, "◇"],
    ["Analytics", "analytics", "▥"],
    ["Downtime", "downtime", "◷"],
    ["Leadership dashboard", "leadership", "◫"],
    ["Improvement ideas", "ideas", "✧"],
    ["Notifications", null, "✉"],
    ["Manage", "manage", "⊞"],
    ["Accounts", "users", "♙"],
    ["Permissions", "permissions", "⚙"],
    ["My account", null, "○"],
  ];
  const descriptions: Record<string, string> = {
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
    "Supervisor audits":
      "Verify the standard and measure actual operator cycle times.",
    Training: "Practical know-how, ready when your team needs it.",
    Troubleshooting: "Find the guidance to get your process back on track.",
    Analytics: "Understand variation, spot failures, and track performance.",
    Manage: "Build equipment, standards, and guides for your team.",
    Accounts: "Individual access, with accountability built in.",
    Permissions: "Choose what each role can do across the platform.",
    "My account": "Manage your password and your signed-in devices.",
  };
  return (
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
            .filter(([, c]) => !c || g.includes(c))
            .map(([name, , icon]) => (
              <button
                key={name}
                className={tab === name ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setTab(name);
                  setError("");
                  setNotice("");
                }}
              >
                <span>{icon}</span>
                {name}
                {name === "Notifications" &&
                  operations.notifications.some((n) => !n.readAt) && (
                    <span className="notification-count">
                      {operations.notifications.filter((n) => !n.readAt).length}
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
        <div className="page">
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
              <a className="outline" href="/api/export">
                ↓ Export Excel
              </a>
            )}
          </div>
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
              !platformReady)) && (
            <p className="muted" role="status">
              Loading section data…
            </p>
          )}
          {tab === "Overview" && (
            <Overview data={data} go={setTab} grants={g} />
          )}
          {tab === "Standard work" && platformReady && (
            <Work data={data} save={save} busy={busy} audit={false} />
          )}
          {tab === "Supervisor audits" && platformReady && (
            <Work data={data} save={save} busy={busy} audit />
          )}
          {tab === "Time studies" && platformReady && (
            <Studies data={data} save={save} busy={busy} />
          )}
          {tab === "Training" && platformReady && (
            <Content
              data={data}
              kind="video"
              manage={g.includes("training")}
              save={save}
              busy={busy}
            />
          )}
          {tab === "Troubleshooting" && platformReady && (
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
              equipment={data.equipment}
              admin={user.role === "Admin"}
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
              save={(b) => save(b, "/api/operations")}
              busy={busy}
            />
          )}
          {tab === "Notifications" && (
            <Notifications
              data={operations}
              save={(b) => save(b, "/api/operations")}
              busy={busy}
              openIdea={() => setTab("Improvement ideas")}
            />
          )}
          {tab === "Leadership dashboard" && (
            <Leadership
              timezone={operations.config.timezone}
              canExport={g.includes("export")}
            />
          )}
          {tab === "Manage" && platformReady && (
            <Manage data={data} save={save} busy={busy} />
          )}
          {tab === "Analytics" && platformReady && <Analytics data={data} />}
          {tab === "Permissions" && platformReady && (
            <Permissions data={data} save={save} busy={busy} />
          )}
          {tab === "Accounts" && platformReady && (
            <Accounts data={data} save={save} busy={busy} />
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
  );
}
