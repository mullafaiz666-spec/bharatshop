import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { eq } from "drizzle-orm";

export async function GET() {
  const demoUser = await ensureDemoDataSeeded();
  return NextResponse.json({ user: demoUser });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, password, name, minProfitMarginPct, maxDailySpendInr, defaultMarginPct } = body;

    await ensureDemoDataSeeded();

    if (action === "login") {
      const allUsers = await db.select().from(users).where(eq(users.email, email || "operator@bharatdrop.in"));
      if (allUsers.length > 0) {
        return NextResponse.json({ user: allUsers[0], message: "BHARATDROP Command Deck mein aapka swagat hai!" });
      }
      return NextResponse.json({ error: "Invalid operator credentials" }, { status: 401 });
    }

    if (action === "register") {
      if (!email || !name) {
        return NextResponse.json({ error: "Name and email required" }, { status: 400 });
      }
      const [newUser] = await db.insert(users).values({
        email, name,
        passwordHash: password || "bharatdrop2026",
        role: "AI Dropship Operator",
        aiAutoPilotEnabled: true,
        minProfitMarginPct: "35.00",
        autoFulfillOrders: true,
        maxDailySpendInr: "200000.00",
        gstRegistered: true,
        defaultMarginPct: "40.00",
      }).returning();
      return NextResponse.json({ user: newUser, message: "Operator profile created!" });
    }

    if (action === "updateSettings") {
      const allUsers = await db.select().from(users).limit(1);
      if (!allUsers[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const [updated] = await db.update(users).set({
        ...(name && { name }),
        ...(minProfitMarginPct !== undefined && { minProfitMarginPct: Number(minProfitMarginPct).toFixed(2) }),
        ...(maxDailySpendInr !== undefined && { maxDailySpendInr: Number(maxDailySpendInr).toFixed(2) }),
        ...(defaultMarginPct !== undefined && { defaultMarginPct: Number(defaultMarginPct).toFixed(2) }),
      }).where(eq(users.id, allUsers[0].id)).returning();
      return NextResponse.json({ user: updated, message: "AI Risk Governor settings saved." });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Auth error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
