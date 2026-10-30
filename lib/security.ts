import {
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { Capability, capabilities } from "./rules";
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    rawScrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export function passwordValid(p: string) {
  return (
    p.length >= 12 &&
    p.length <= 128 &&
    !/^(.)\1+$/.test(p) &&
    p.trim().length >= 12 &&
    !["password1234", "123456789012", "qwerty123456"].includes(p.toLowerCase())
  );
}
export async function hashPassword(p: string) {
  if (!passwordValid(p))
    throw new HttpError(400, "Use a unique password of 12–128 characters");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(p, salt);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(p: string, encoded: string) {
  if (p.length > 128) return false;
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  const key = await scrypt(p, salt);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
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
export async function grants(user: { role: string }) {
  if (user.role === "Admin") return [...capabilities];
  const policy = await db.policy.findUnique({ where: { role: user.role } });
  return Array.isArray(policy?.grants)
    ? policy.grants.filter(
        (x): x is Capability =>
          typeof x === "string" && capabilities.includes(x as Capability),
      )
    : [];
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
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function jsonBody(req: Request, max = 256 * 1024) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || req.headers.get("origin") !== new URL(origin).origin)
    throw new HttpError(403, "Request origin is not allowed");
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
    throw new HttpError(415, "Send JSON");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => void reader.cancel(), 15000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        void reader.cancel();
        throw new HttpError(413, "Request is too large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid or incomplete JSON");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
export async function limit(key: string, max: number, seconds: number) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "Rate" (key,count,expires) VALUES (${key},1,${new Date(+now + seconds * 1000)}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "Rate".expires < ${now} THEN 1 ELSE "Rate".count+1 END, expires=CASE WHEN "Rate".expires < ${now} THEN ${new Date(+now + seconds * 1000)} ELSE "Rate".expires END RETURNING count`;
  if (rows[0].count > max)
    throw new HttpError(429, "Too many requests. Try again later.");
}
export function failure(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e && typeof e === "object" && "issues" in e)
    return Response.json(
      { error: "Check the entered values" },
      { status: 400 },
    );
  console.error("Request failed", e instanceof Error ? e.name : "unknown");
  return Response.json(
    { error: "Unable to complete the request" },
    { status: 500 },
  );
}
