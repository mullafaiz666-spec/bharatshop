import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { buildOpenMontagePlan, openMontageIntegrationMetadata } from "@/lib/creative/openmontage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    ...openMontageIntegrationMetadata(),
    operator: { id: admin.id, name: admin.name, role: admin.role },
    policy: "OpenMontage planning may run in the app; rendering and provider execution are local-workstation-only and remain approval-gated.",
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "plan").trim().toLowerCase();

  if (["execute", "render", "generate", "publish"].includes(action)) {
    return NextResponse.json({
      error: "OpenMontage execution is intentionally disabled in the hosted BharatShop API.",
      code: "LOCAL_WORKSTATION_REQUIRED",
      ...openMontageIntegrationMetadata(),
      next: "Create a plan here, then hand it to the authorized local creative workstation. Publishing remains separately approval-gated.",
    }, { status: 409 });
  }

  if (action === "status") {
    return NextResponse.json({
      ...openMontageIntegrationMetadata(),
      operator: { id: admin.id, name: admin.name, role: admin.role },
    });
  }

  if (action !== "plan") {
    return NextResponse.json({ error: "Unknown OpenMontage action" }, { status: 400 });
  }

  try {
    const plan = buildOpenMontagePlan({
      title: body?.title,
      brand: body?.brand,
      goal: body?.goal,
      audience: body?.audience,
      durationSeconds: body?.durationSeconds ?? body?.duration,
      aspectRatio: body?.aspectRatio ?? body?.aspect,
      creativeDirection: body?.creativeDirection ?? body?.style,
      productUrl: body?.productUrl,
      referenceUrl: body?.referenceUrl,
    });

    return NextResponse.json({
      status: "PLAN_READY",
      execution: "LOCAL_WORKSTATION_ONLY",
      plan,
      operator: { id: admin.id, name: admin.name, role: admin.role },
      next: "Use the local OpenMontage adapter to materialize the plan and continue through creative approval gates.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid OpenMontage plan request" }, { status: 422 });
  }
}
