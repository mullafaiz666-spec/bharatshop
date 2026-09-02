import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { db } from "@/db";
import { adminSessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const ADMIN_COOKIE = "bharatshop_admin_session";
export const ADMIN_ROLES = ["Admin", "Owner", "Operator"] as const;
const TTL_SECONDS = 60 * 60 * 12;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `pbkdf2$sha512$120000$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, digestName, iterations, salt, digest] = stored.split("$");
  if (scheme !== "pbkdf2" || digestName !== "sha512" || !iterations || !salt || !digest) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 64, "sha512").toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  await db.insert(adminSessions).values({ userId, tokenHash: tokenHash(token), expiresAt });
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function getAdminUser() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(adminSessions)
    .innerJoin(users, eq(adminSessions.userId, users.id))
    .where(and(eq(adminSessions.tokenHash, tokenHash(token)), gt(adminSessions.expiresAt, new Date())))
    .limit(1);

  const user = rows[0];
  if (!user || !ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) return null;
  return user;
}

/** Use inside sensitive Route Handlers. Middleware alone is not an authorization check. */
export async function requireAdminUser() {
  return getAdminUser();
}

export async function clearAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash(token)));
  store.delete(ADMIN_COOKIE);
}
