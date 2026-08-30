import { NextResponse } from "next/server";
import { db } from "@/db";
import { automationRules, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

export async function GET() {
  await ensureDemoDataSeeded();
  const all = await db.select().from(automationRules).orderBy(desc(automationRules.createdAt));
  return NextResponse.json({ rules: all });
}

export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json();
    const { name, description, triggerType = "VIRAL_SCORE_ABOVE", triggerThreshold = "90.00", actionType = "AUTO_IMPORT_AND_PUBLISH", actionParam = "Meesho + Glowroad India", isEnabled = true } = body;
    if (!name || !description) return NextResponse.json({ error: "Name and description required" }, { status: 400 });

    const [created] = await db.insert(automationRules).values({
      userId, name, description, triggerType,
      triggerThreshold: Number(triggerThreshold).toFixed(2),
      actionType, actionParam, isEnabled: Boolean(isEnabled), executionCount: 0,
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "Rule-Engine // Governor",
      actionType: "RULE_CREATED",
      message: `Naya automation rule create kiya: "${created.name}" [Trigger: ${created.triggerType}]`,
      profitImpactInr: "0.00",
      status: "INFO",
    });

    return NextResponse.json({ rule: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, isEnabled, triggerThreshold, name, description } = body;
    if (!id) return NextResponse.json({ error: "Rule ID required" }, { status: 400 });

    const [updated] = await db.update(automationRules).set({
      ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
      ...(triggerThreshold !== undefined && { triggerThreshold: Number(triggerThreshold).toFixed(2) }),
      ...(name && { name }),
      ...(description && { description }),
    }).where(eq(automationRules.id, Number(id))).returning();

    await db.insert(aiActivityLogs).values({
      userId: updated.userId,
      agentName: "Rule-Engine // Governor",
      actionType: updated.isEnabled ? "RULE_ENABLED" : "RULE_PAUSED",
      message: `Rule "${updated.name}" ${updated.isEnabled ? "activated" : "paused"}`,
      profitImpactInr: "0.00",
      status: updated.isEnabled ? "SUCCESS" : "WARNING",
    });

    return NextResponse.json({ rule: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    await db.delete(automationRules).where(eq(automationRules.id, Number(id)));
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
