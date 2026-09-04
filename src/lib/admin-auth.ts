import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { db } from "@/db";
import { adminSessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

const COOKIE = "bharatshop_admin_session";
const TTL_SECONDS = 60 * 60 * 12;
const SESSION_SECRET_ENV = "ADMIN_SESSION_SECRET";

function sessionSecret() {
  const secret = process.env[SESSION_SECRET_ENV];
  if (!secret || secret.length < 32) {
    throw new Error(`${SESSION_SECRET_ENV} must be configured with at least 32 characters`);
  }
  return secret;
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

function signToken(token: string) {
  return createHash("sha256").update(`${sessionSecret()}\0${token}`).digest("hex");
}

function signedCookieValue(token: string) {
  return `${token}.${signToken(token)}`;
}

function verifyCookieValue(value: string | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const token = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = signToken(token);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `pbkdf2$sha512$120000$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, digestName, iterations, salt, digest] = stored.split("$");
  if (scheme !== "pbkdf2" || digestName !== "sha512" || !iterations || !salt || !digest) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 64, "sha512").toString("hex");
  const a = Buffer.from(actual, "hex"); const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createAdminSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  await db.insert(adminSessions).values({ userId, tokenHash: tokenHash(token), expiresAt });
  const store = await cookies();
  store.set(COOKIE, signedCookieValue(token), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL_SECONDS });
}

export function verifyAdminSessionCookie(value: string | undefined) {
  try { return verifyCookieValue(value); } catch { return null; }
}

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
