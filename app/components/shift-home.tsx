"use client";
import { sectionLabel } from "@/lib/navigation";
import { roleHome } from "@/lib/floor-navigation";
import { canOpenSection } from "@/lib/navigation";
import type { NavigationUser } from "@/lib/navigation";
export default function ShiftHome({
  user,
  go,
}: {
  user: NavigationUser;
  go: (name: string) => void;
}) {
  const home = roleHome(user);
  return (
    <section className="panel shift-home" aria-label="Role home">
      <span className="eyebrow">START HERE</span>
      <h2>{home.title}</h2>
      <p>
        {home.profile === "maintenance"
          ? "Start with urgent defects and due PM/CIL work. Use Machines to find instructions and history together."
          : home.profile === "supervisor"
            ? "Review missed checks and unresolved work across your assigned areas, then hand over unfinished actions."
            : user.role === "Admin"
              ? "Set up your locations, people and permissions. Review service health under Integrations."
              : user.role === "Manager"
                ? "Review exceptions and overdue work for your assigned departments. Use your department dashboard below for the queue."
                : user.role === "DL/TL"
                  ? "Complete leader work, check missed tasks and pass important conditions to the next shift."
                  : "Choose your assigned work. Confirm the machine, complete the checks and wait for the saved confirmation."}
      </p>
      {user.role === "Admin" &&
        canOpenSection(user, "Standard work") &&
        !home.primary.includes("Standard work") && (
          <button
            type="button"
            className="primary"
            onClick={() => go("Standard work")}
          >
            Open operator tasks →
          </button>
        )}
      <div className="button-row role-shortcuts">
        {home.primary.map((name) => (
          <button
            type="button"
            className="outline"
            key={name}
            onClick={() => go(name)}
          >
            <strong>{sectionLabel(name)}</strong>
            <span>Open →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
