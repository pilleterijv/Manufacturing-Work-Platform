"use client";
import { canOpenSection, type NavigationUser } from "@/lib/navigation";
import type { ReactNode } from "react";
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
export default function Overview({
  data,
  go,
  grants,
  children,
  admin = false,
  preferences,
  navigationUser,
}: {
  data: Data;
  go: (s: string) => void;
  grants: Capability[];
  children?: ReactNode;
  admin?: boolean;
  navigationUser?: NavigationUser;
  preferences?: import("@/lib/dashboard-preferences").DashboardPreferences;
}) {
  const runs = data.records.filter((r) => r.kind === "run"),
    audits = data.records.filter((r) => r.kind === "audit");
  return (
    <>
      {preferences?.showLaunchpad !== false && !navigationUser && (
        <div className="hero dashboard-hero">
          <div>
            <span className="eyebrow">YOUR FLOOR. ONE CONNECTED VIEW.</span>
            <h2>Every section. Every shift.</h2>
            <p>
              Check performance, open a workflow, and keep improvements moving.
            </p>
            {grants.includes("work") && (
              <button className="cream" onClick={() => go("Standard work")}>
                Start standard work <span>→</span>
              </button>
            )}
          </div>
        </div>
      )}
      {preferences?.showLaunchpad !== false && (
        <section aria-labelledby="workspace-sections">
          <div className="section-title">
            <h2 id="workspace-sections">Explore your workspace</h2>
            <span className="small muted">Sections available to your role</span>
          </div>
          <div className="module-grid">
            {(
              [
                [
                  "Dashboard settings",
                  null,
                  "⚙",
                  "Choose your login section, panels and dashboard layout.",
                ],
                [
                  "Assistant",
                  null,
                  "?",
                  "Get navigation help for the sections available to you.",
                ],
                [
                  "Standard work",
                  "work",
                  "☑",
                  "Follow checklists and capture photo evidence.",
                ],
                [
                  "Time studies",
                  "studies",
                  "◷",
                  "Time work elements and review observations.",
                ],
                [
                  "DL/TL Standard Work",
                  "audits",
                  "◎",
                  "Verify standards and flag follow-ups.",
                ],
                [
                  "Downtime",
                  "downtime",
                  "◷",
                  "Start or stop a machine timer; review shift losses.",
                ],
                [
                  "Improvement ideas",
                  "ideas",
                  "✧",
                  "Assign pilots, track proposals and validate results.",
                ],
                [
                  "Leadership dashboard",
                  "leadership",
                  "▥",
                  "Compare overall and department performance.",
                ],
                [
                  "Training",
                  null,
                  "▷",
                  "Find equipment training and play linked videos.",
                ],
                [
                  "Troubleshooting",
                  null,
                  "◇",
                  "Find process guides and recovery instructions.",
                ],
                [
                  "Analytics",
                  "analytics",
                  "▤",
                  "Review checks, variation and detailed records.",
                ],
                [
                  "Notifications",
                  null,
                  "✉",
                  "Read your pilot assignments and messages.",
                ],
                [
                  "Manage",
                  "manage",
                  "⊞",
                  "Configure equipment and publish standard revisions.",
                ],
                [
                  "Accounts",
                  "users",
                  "♙",
                  "Create accounts and manage individual access.",
                ],
                [
                  "Permissions",
                  "permissions",
                  "⚙",
                  "Choose which workflows each role can use.",
                ],
                [
                  "Preventive maintenance",
                  "maintenance",
                  "⚒",
                  "Schedule machine PMs and retain completion evidence.",
                ],
                [
                  "TPM / CIL",
                  "maintenance",
                  "⚒",
                  "Clean, inspect and lubricate assigned machines.",
                ],
                [
                  "5S audits",
                  "fiveS",
                  "◎",
                  "Score area standards and record photo or video evidence.",
                ],
                [
                  "Defect reporting",
                  "defects",
                  "◇",
                  "Report abnormalities and submit MaintainX work orders.",
                ],
                [
                  "Problem solving",
                  "problems",
                  "◈",
                  "Investigate 2D, 4D and 8D issues; follow up actions.",
                ],
                [
                  "Shift requirements",
                  "manage",
                  "◷",
                  "Schedule work and switch missed-shift alerts on or off.",
                ],
                ...(admin
                  ? [
                      [
                        "Integrations",
                        null,
                        "⇄",
                        "Map machines and connect factory event sources.",
                      ] as [string, Capability | null, string, string],
                    ]
                  : []),
                [
                  "My account",
                  null,
                  "○",
                  "Update your password and revoke other sessions.",
                ],
              ] as [string, Capability | null, string, string][]
            )
              .filter(([name, capability]) =>
                navigationUser
                  ? canOpenSection(navigationUser, name)
                  : !capability || grants.includes(capability),
              )
              .map(([name, , icon, detail]) => (
                <button
                  className="module-card"
                  key={name}
                  onClick={() => go(name)}
                  aria-label={`Open ${name} section`}
                >
                  <span className="module-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>{detail}</small>
                  </span>
                  <span className="module-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}
      {preferences?.showPerformance !== false && children && (
        <div className="dashboard-report">{children}</div>
      )}
      {preferences?.showHistory !== false && (
        <>
          <h2>Record overview</h2>
          <p className="small muted">
            These totals and recent activity cover records available to your
            account. They do not use the department dashboard's date or
            department filters.
          </p>
          <div className="metrics">
            <Metric
              onClick={
                grants.includes("work") ? () => go("Standard work") : undefined
              }
              label="Completed work"
              value={data.overview?.runs ?? runs.length}
              detail="Stored verification records"
            />
            <Metric
              onClick={
                grants.includes("studies")
                  ? () => go("Time studies")
                  : undefined
              }
              label="Time studies"
              value={
                data.overview?.studies ??
                data.records.filter((r) => r.kind === "study").length
              }
              detail="Raw observations preserved"
            />
            <Metric
              onClick={
                grants.includes("audits")
                  ? () => go("DL/TL Standard Work")
                  : undefined
              }
              label="DL/TL Standard Work"
              value={data.overview?.leaderWork ?? 0}
              detail="Completed leader shift checklists"
            />
            <Metric
              onClick={
                grants.includes("analytics") ? () => go("Analytics") : undefined
              }
              label="Follow-ups"
              value={
                data.overview?.followUps ??
                data.records.filter((r) => r.data.followUp).length
              }
              detail="Failures or cycles over target"
              accent
            />
          </div>
          <div className="section-title">
            <h2>Your floor, at a glance</h2>
            <span className="muted">Latest activity</span>
          </div>
          <History data={data} records={data.records.slice(0, 8)} />
        </>
      )}
    </>
  );
}
