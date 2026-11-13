// Fixed event identifiers and selected metadata only: never bodies, credentials,
// email addresses, headers, tokens, usernames, query strings or exception text.
export const securityEvents = [
  "login_failed",
  "login_succeeded",
  "password_changed",
  "logout",
  "sessions_revoked",
  "password_reset",
  "origin_rejected",
  "rate_limited",
] as const;
export function securityEvent(
  event: (typeof securityEvents)[number],
  data: { actorId?: string; subjectHash?: string; scope?: string } = {},
) {
  const safe: {
    event: string;
    at: string;
    actorId?: string;
    subjectHash?: string;
    scope?: string;
  } = { event, at: new Date().toISOString() };
  if (data.actorId && /^[a-f0-9-]{36}$/.test(data.actorId))
    safe.actorId = data.actorId;
  if (data.subjectHash && /^[a-f0-9]{64}$/.test(data.subjectHash))
    safe.subjectHash = data.subjectHash;
  if (data.scope && /^[a-z][a-z0-9-]{0,39}$/.test(data.scope))
    safe.scope = data.scope;
  console.info(JSON.stringify(safe));
}
