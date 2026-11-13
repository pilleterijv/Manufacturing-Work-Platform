"use client";
import { roleHome } from "@/lib/floor-navigation";
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
        {user.role === "Admin"
          ? "Set up your locations, people and permissions. Review service health under Integrations."
          : user.role === "Manager"
            ? "Review exceptions and overdue work for your assigned departments. Use your department dashboard below for the queue."
            : user.role === "DL/TL"
              ? "Complete leader work, check missed tasks and pass important conditions to the next shift."
              : "Choose your assigned work. Confirm the machine, complete the checks and wait for the saved confirmation."}
      </p>
      <div className="module-grid">
        {home.primary.map((name) => (
          <button
            type="button"
            className="module-card"
            key={name}
            onClick={() => go(name)}
          >
            <strong>{name}</strong>
            <span>Open →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
