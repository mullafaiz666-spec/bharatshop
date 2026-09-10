import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { db } from "@/db";
import { adminSessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

const COOKIE = "bharatshop_admin_session";
const TTL_SECONDS = 60 * 60 * 12;
const SESSION_SECRET_ENV = "ADMIN_SESSION_SECRET";

function sessionSecret() {
  const secret = process.env[SESSION_SECRET_ENV];
  if (!secret || secret.length < 32) throw new Error(`${SESSION_SECRET_ENV} must be configured with at least 32 characters`);
  return secret;
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function signToken(token: string, expiresUnix: number) {
  return createHmac("sha256", sessionSecret()).update(`${token}.${expiresUnix}`).digest("hex");
}
function signedCookieValue(token: string, expiresUnix: number) { return `${token}.${expiresUnix}.${signToken(token, expiresUnix)}`; }
function verifyCookieValue(value: string | undefined) {
  if (!value) return null;
  const [token, expiresText, signature, ...extra] = value.split(".");
  if (extra.length || !/^[a-f0-9]{64}$/i.test(token || "") || !/^\d{10,13}$/.test(expiresText || "") || !/^[a-f0-9]{64}$/i.test(signature || "")) return null;
  const expiresUnix = Number(expiresText);
  if (!Number.isSafeInteger(expiresUnix) || expiresUnix <= Math.floor(Date.now() / 1000)) return null;
  const expected = signToken(token, expiresUnix);
  const a = Buffer.from(signature, "hex"), b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 210000, 64, "sha512").toString("hex");
  return `pbkdf2$sha512$210000$${salt}$${digest}`;
}
export function verifyPassword(password: string, stored: string) {
  const [scheme, digestName, iterations, salt, digest] = stored.split("$");
  const rounds = Number(iterations);
  if (scheme !== "pbkdf2" || digestName !== "sha512" || !Number.isSafeInteger(rounds) || rounds < 100000 || rounds > 1000000 || !/^[a-f0-9]{32}$/i.test(salt || "") || !/^[a-f0-9]{128}$/i.test(digest || "")) return false;
  const actual = pbkdf2Sync(password, salt, rounds, 64, "sha512").toString("hex");
  const a = Buffer.from(actual, "hex"), b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createAdminSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  const expiresUnix = Math.floor(expiresAt.getTime() / 1000);
  await db.insert(adminSessions).values({ userId, tokenHash: tokenHash(token), expiresAt });
  const store = await cookies();
  store.set(COOKIE, signedCookieValue(token, expiresUnix), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL_SECONDS });
}
export function verifyAdminSessionCookie(value: string | undefined) { try { return verifyCookieValue(value); } catch { return null; } }
export async function getAdminUser() {
  const store = await cookies(); const token = verifyAdminSessionCookie(store.get(COOKIE)?.value);
  if (!token) return null;
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(adminSessions).innerJoin(users, eq(adminSessions.userId, users.id))
    .where(and(eq(adminSessions.tokenHash, tokenHash(token)), gt(adminSessions.expiresAt, new Date()))).limit(1);
  const user = rows[0];
  if (!user || !["Admin", "Owner", "Operator"].includes(user.role)) return null;
  return user;
}
export async function clearAdminSession() {
  const store = await cookies(); const token = verifyAdminSessionCookie(store.get(COOKIE)?.value);
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash(token)));
  store.delete(COOKIE);
}
