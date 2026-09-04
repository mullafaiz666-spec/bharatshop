import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdminSession, hashPassword, verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const configuredAdminEmail = () => (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

async function ensureConfiguredAdmin(email: string, password: string) {
  const adminEmail = configuredAdminEmail();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPassword) return null;
  if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  if (email !== adminEmail || password !== adminPassword) return null;

  const passwordHash = hashPassword(adminPassword);
  const rows = await db.insert(users).values({
    email: adminEmail,
    name: "BharatShop Administrator",
    passwordHash,
    role: "Admin",
  }).onConflictDoUpdate({
    target: users.email,
    set: { name: "BharatShop Administrator", passwordHash, role: "Admin" },
  }).returning({ id: users.id, role: users.role });

  return rows[0] || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

    const configuredEmail = configuredAdminEmail();
    if (configuredEmail && email !== configuredEmail) {
      return NextResponse.json({ error: "Invalid administrator credentials" }, { status: 401 });
    }

    const configured = await ensureConfiguredAdmin(email, password);
    if (configured) {
      await createAdminSession(configured.id);
      return NextResponse.json({ ok: true });
    }

    const rows = await db.select({ id: users.id, passwordHash: users.passwordHash, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !["Admin", "Owner", "Operator"].includes(user.role) || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid administrator credentials" }, { status: 401 });
    }
    await createAdminSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin login failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to sign in" }, { status: 503 });
  }
}
