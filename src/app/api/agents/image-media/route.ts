import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";
import { isSearxngConfigured } from "@/lib/searxng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

async function authorized(request: Request) {
  const admin = await getAdminUser();
  if (admin) return { kind: "admin" as const, id: admin.id, name: admin.name, role: admin.role };
  const expected = String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-automation-token") || "";
  if (expected && supplied === expected) return { kind: "automation" as const, id: null, name: "BharatShop automation", role: "Automation" };
  return null;
}

export async function GET(request: Request) {
  const actor = await authorized(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    agent: "Image & Media Agent",
    status: isSearxngConfigured() ? "ready" : "blocked_missing_search_provider",
    operator: actor,
    capabilities: [
      "searxng_image_search",
      "https_only_media_fetch",
      "ssrf_safe_redirect_walk",
      "byte_level_content_sniffing",
      "jpeg_png_webp_dimensions",
      "bounded_file_size",
      "sha256_duplicate_removal",
      "source_title_evidence",
      "postgres_media_persistence",
    ],
    honestyPolicy: "No placeholders and no fabricated vision results. Technical/source evidence is explicitly distinct from semantic AI vision.",
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const actor = await authorized(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const productId = Number(body.productId || body.product_id || 0) || undefined;
    const productName = String(body.productName || body.product_name || "").trim() || undefined;
    if (!productId && !productName) return NextResponse.json({ error: "productId or productName is required" }, { status: 400 });
    const result = await resolveVerifiedProductMedia(productId, productName);
    const blocked = ["NOT_FOUND", "SEARCH_ERROR", "NEEDS_IMAGES", "ERROR"].includes(String((result as any)?.status || ""));
    return NextResponse.json({ agent: "Image & Media Agent", operator: actor, result }, { status: blocked ? 422 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image and Media agent failed" }, { status: 500 });
  }
}
