import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const publicUserFields = { id: users.id, email: users.email, name: users.name, role: users.role, aiAutoPilotEnabled: users.aiAutoPilotEnabled, minProfitMarginPct: users.minProfitMarginPct, maxDailySpendInr: users.maxDailySpendInr, defaultMarginPct: users.defaultMarginPct };

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
  const [user] = await db.select(publicUserFields).from(users).where(eq(users.id, admin.id)).limit(1);
  if (!user) return NextResponse.json({ error: "Administrator not found" }, { status: 404 });
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
    const body = await req.json();
    if (body.action !== "updateSettings") return NextResponse.json({ error: "Legacy login/register actions are disabled. Use /api/auth/admin-login." }, { status: 410 });
    const name = body.name === undefined ? undefined : String(body.name).trim().slice(0, 120);
    const minMargin = body.minProfitMarginPct === undefined ? undefined : Number(body.minProfitMarginPct);
    const maxSpend = body.maxDailySpendInr === undefined ? undefined : Number(body.maxDailySpendInr);
    const defaultMargin = body.defaultMarginPct === undefined ? undefined : Number(body.defaultMarginPct);
    if (minMargin !== undefined && (!Number.isFinite(minMargin) || minMargin < 0 || minMargin > 100)) return NextResponse.json({ error: "Minimum profit margin must be between 0 and 100" }, { status: 400 });
    if (defaultMargin !== undefined && (!Number.isFinite(defaultMargin) || defaultMargin < 0 || defaultMargin > 500)) return NextResponse.json({ error: "Default margin must be between 0 and 500" }, { status: 400 });
    if (maxSpend !== undefined && (!Number.isFinite(maxSpend) || maxSpend < 0 || maxSpend > 10000000)) return NextResponse.json({ error: "Maximum daily spend is outside the allowed range" }, { status: 400 });
    const patch = {
      ...(name && { name }),
      ...(minMargin !== undefined && { minProfitMarginPct: minMargin.toFixed(2) }),
      ...(maxSpend !== undefined && { maxDailySpendInr: maxSpend.toFixed(2) }),
      ...(defaultMargin !== undefined && { defaultMarginPct: defaultMargin.toFixed(2) }),
    };
    if (!Object.keys(patch).length) return NextResponse.json({ error: "No valid settings supplied" }, { status: 400 });
    const [updated] = await db.update(users).set(patch).where(eq(users.id, admin.id)).returning(publicUserFields);
    return NextResponse.json({ user: updated, message: "AI Risk Governor settings saved." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("Administrator settings update failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to update administrator settings" }, { status: 500 });
  }
}
