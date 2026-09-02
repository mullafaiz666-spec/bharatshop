import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdminSession, verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    const rows = await db.select({ id: users.id, passwordHash: users.passwordHash, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !["Admin", "Owner", "Operator"].includes(user.role) || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid administrator credentials" }, { status: 401 });
    }
    await createAdminSession(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to sign in" }, { status: 503 });
  }
}
