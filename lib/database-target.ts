export function validateDatabaseTargets(
  runtime: string | undefined,
  setup?: string,
) {
  if (!runtime) throw Error("DATABASE_URL is required");
  const primary = new URL(runtime),
    migration = new URL(setup || runtime);
  for (const u of [primary, migration])
    if (
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      !u.hostname ||
      !u.pathname ||
      u.pathname === "/"
    )
      throw Error("Use an explicit PostgreSQL URL and database name");
  if (
    primary.hostname.toLowerCase() !== migration.hostname.toLowerCase() ||
    (primary.port || "5432") !== (migration.port || "5432") ||
    decodeURIComponent(primary.pathname) !==
      decodeURIComponent(migration.pathname)
  )
    throw Error(
      "DATABASE_SETUP_URL must target the same host, port and database as DATABASE_URL; only credentials may differ",
    );
}
