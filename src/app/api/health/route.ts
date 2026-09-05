import { db } from "@/db";
import { sql } from "drizzle-orm";
import { aiModels, checkAI, runAI } from "@/lib/ai/provider";
import { searxngImageSearch } from "@/lib/searxng";

export const dynamic = "force-dynamic";

const VISION_PROBE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function checkSearXNG(deep: boolean) {
  const base = String(process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!base) return { configured: false, ready: false, reason: "missing" };
  if (!deep) return { configured: true, ready: true, exercised: false };
  try {
    const results = await searxngImageSearch("laptop product image", { limit: 1, timeoutMs: 12000 });
    return { configured: true, ready: results.length > 0, exercised: true, resultCount: results.length };
  } catch (e) {
    return { configured: true, ready: false, exercised: true, reason: "image_search_failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkVision(deep: boolean) {
  if (!deep) return { ready: true, exercised: false, model: aiModels().vision };
  try {
    const data = await runAI([{ role: "user", content: [{ type: "text", text: "Describe this image in one short phrase. Return only the phrase." }, { type: "image_url", image_url: { url: `data:image/png;base64,${VISION_PROBE_PNG_BASE64}` } }] }], { model: aiModels().vision, temperature: 0, maxTokens: 32 });
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    return { ready: content.length > 0, exercised: true, model: aiModels().vision };
  } catch (e) {
    return { ready: false, exercised: true, model: aiModels().vision, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const ai = await checkAI(deep);
  const vision = await checkVision(deep);
  const searxng = await checkSearXNG(deep);
  try {
    await db.execute(sql`select 1`);
    const postgres = { ready: true };
    const ok = postgres.ready && ai.ready && vision.ready && searxng.ready;
    return Response.json({ ok, readiness: { postgres, ai, vision, searxng }, providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready }, models: ai.models, provider: ai.provider, deep }, { status: ok ? 200 : 503 });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    let dbTarget = "unknown";
    try { const raw = process.env.DATABASE_URL; if (raw) { const parsed = new URL(raw); dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`; } } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), dbTarget });
    return Response.json({ ok: false, readiness: { postgres: { ready: false }, ai, vision, searxng }, providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready }, deep }, { status: 503 });
  }
}
