import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http-error";
let hashing = 0;
const waiting: (() => void)[] = [];
const scrypt = async (password: string, salt: string) => {
  if (hashing >= 2) {
    if (waiting.length >= 8)
      throw new HttpError(429, "Sign-in is busy. Try again shortly.");
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else hashing++;
  try {
    return await derive(password, salt);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else hashing--;
  }
};
const derive = (password: string, salt: string) =>
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
    throw new Error("Use a unique password of 12–128 characters");
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
