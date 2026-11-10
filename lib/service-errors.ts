export function serviceIssue(error: unknown) {
  const codes: string[] = [];
  let current = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (
      typeof e.code === "string" &&
      /^(P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET)$/.test(
        e.code,
      )
    )
      codes.push(e.code);
    current = e.cause;
  }
  const code = codes[0] || "UNKNOWN";
  if (codes.some((c) => ["P1000", "28P01", "28000"].includes(c)))
    return {
      code,
      kind: "database",
      message:
        "PostgreSQL rejected the configured credentials. Check private database settings.",
    };
  if (codes.some((c) => ["P2021", "P2022", "42P01", "42703"].includes(c)))
    return {
      code,
      kind: "database",
      message:
        "Database schema is missing or out of date. Run npm run db:setup against this same database.",
    };
  if (
    codes.some((c) =>
      [
        "P1001",
        "P1002",
        "P1017",
        "P2024",
        "P2037",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "ECONNRESET",
        "53300",
        "57P03",
        "3D000",
      ].includes(c),
    )
  )
    return {
      code,
      kind: "database",
      message:
        "PostgreSQL is unavailable or its connection limit was reached. Check that the database is running and reachable.",
    };
  return {
    code,
    kind: "service",
    message: "Check private settings and service availability.",
  };
}
