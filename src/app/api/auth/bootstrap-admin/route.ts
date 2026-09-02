import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// One-time production bootstrap. Once an administrator exists, this endpoint
// refuses further password rotation/creation so the bootstrap secret cannot be
// used as a permanent backdoor.
export async function POST(req: Request) {
  try {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) return NextResponse.json({ error: "Administrator bootstrap is not configured" }, { status: 503 });
    const body = await req.json();
    const secret = String(body.secret || "");
    if (!secret || secret !== expected) return NextResponse.json({ error: "Invalid bootstrap secret" }, { status: 401 });

    const existingAdmin = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["Admin", "Owner", "Operator"]))
      .limit(1);
    if (existingAdmin.length) {
      return NextResponse.json({ error: "Administrator bootstrap has already been completed" }, { status: 409 });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "BharatShop Administrator").trim();
    const password = String(body.password || "");
    if (!email || password.length < 12) return NextResponse.json({ error: "Admin email and a 12+ character password are required" }, { status: 400 });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) {
      await db.update(users).set({ name, passwordHash: hashPassword(password), role: "Admin" }).where(eq(users.id, existing[0].id));
      return NextResponse.json({ ok: true, message: "Existing account promoted to Admin" });
    }

    await db.insert(users).values({ name, email, passwordHash: hashPassword(password), role: "Admin" });
    return NextResponse.json({ ok: true, message: "Administrator created" });
  } catch {
    return NextResponse.json({ error: "Unable to bootstrap administrator" }, { status: 503 });
  }
}
