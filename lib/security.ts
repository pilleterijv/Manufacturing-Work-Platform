import { readBodyBytes } from "./http-body";
import { securityEvent } from "./security-events";
import { serviceIssue } from "./service-errors";
import { canAdminister } from "./capabilities";
import type { AdminPrivilege } from "./delegation-rules";
import { grants } from "./capabilities";
export { grants } from "./capabilities";
import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
import {
  configuredOrigin,
  originCheckDiagnostic,
  requestOriginAllowed,
} from "./request-policy";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { Capability, capabilities } from "./rules";
export { passwordValid, verifyPassword } from "./passwords";
import { passwordValid, hashPassword as hash } from "./passwords";
export async function hashPassword(p: string) {
  if (!passwordValid(p))
    throw new HttpError(400, "Use a unique password of 12–128 characters");
  return hash(p);
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const secure = () =>
  process.env.APP_ORIGIN?.startsWith("https://") ?? false;
export const cookieName = () => (secure() ? "__Host-floorwork" : "floorwork");
export async function currentUser() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const s = await db.session.findUnique({
    where: { token: digest(token) },
    include: { user: true },
  });
  return s &&
    s.expires > new Date() &&
    s.user.active &&
    s.version === s.user.version
    ? s.user
    : null;
}
export async function requireUser(cap?: Capability, allowChange = false) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Sign in to continue");
  if (u.mustChange && !allowChange)
    throw new HttpError(403, "Change your temporary password first");
  if (cap && !(await grants(u)).includes(cap))
    throw new HttpError(403, "You do not have permission for this action");
  return u;
}
export function assertRequestOrigin(req: Request) {
  const origin = process.env.APP_ORIGIN;
  const allowed =
    origin &&
    requestOriginAllowed(req.headers, configuredOrigin(origin), {
      CODESPACES: process.env.CODESPACES,
      CODESPACE_NAME: process.env.CODESPACE_NAME,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:
        process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN,
    });
  if (!allowed) {
    securityEvent("origin_rejected");
    if (process.env.CODESPACES === "true")
      console.warn(
        "[origin-check]",
        JSON.stringify(originCheckDiagnostic(req, origin)),
      );
    throw new HttpError(403, "Request origin is not allowed");
  }
}
export async function jsonBody(req: Request, max = 256 * 1024) {
  assertRequestOrigin(req);
  return readJsonBody(req, max);
}
export async function readJsonBody(req: Request, max = 256 * 1024) {
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
    throw new HttpError(415, "Send JSON");
  try {
    return JSON.parse((await readBodyBytes(req, max)).toString("utf8"));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid or incomplete JSON");
  }
}

export async function limit(key: string, max: number, seconds: number) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "Rate" (key,count,expires) VALUES (${key},1,${new Date(+now + seconds * 1000)}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "Rate".expires < ${now} THEN 1 ELSE "Rate".count+1 END, expires=CASE WHEN "Rate".expires < ${now} THEN ${new Date(+now + seconds * 1000)} ELSE "Rate".expires END RETURNING count`;
  if (rows[0].count > max) {
    if (rows[0].count === max + 1)
      securityEvent("rate_limited", { scope: key.split(":")[0] });
    throw new HttpError(429, "Too many requests. Try again later.");
  }
}
export function failure(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e && typeof e === "object" && "issues" in e)
    return Response.json(
      { error: "Check the entered values" },
      { status: 400 },
    );
  const issue = serviceIssue(e);
  if (issue.kind === "database") {
    console.error(`Database request failed [${issue.code}]: ${issue.message}`);
    return Response.json(
      {
        error:
          "The database needs attention. Contact an administrator or retry after service is restored.",
        code: issue.code,
      },
      { status: 503 },
    );
  }
  console.error(
    "Request failed",
    e instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,60}$/.test(e.name)
      ? e.name
      : "unknown",
    issue.code,
  );
  return Response.json(
    { error: "Unable to complete the request" },
    { status: 500 },
  );
}

export async function requireDelegated(
  privilege: AdminPrivilege,
  cap: Capability,
) {
  const u = await requireUser();
  if (!(await grants(u)).includes(cap) && !(await canAdminister(u, privilege)))
    throw new HttpError(403, "This action has not been delegated to you");
  return u;
}
