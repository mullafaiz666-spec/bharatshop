import { db } from "@/db";
import { sql } from "drizzle-orm";
import { aiModels, checkAI, checkVisionProvider } from "@/lib/ai/provider";
import { searxngImageSearch } from "@/lib/searxng";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const ai = await checkAI(deep);
  const vision = await checkVisionProvider(deep);
  const searxng = await checkSearXNG(deep);
  const openai = { configured: ai.provider === "openai" && ai.configured, ready: ai.provider === "openai" && ai.ready, provider: ai.provider, model: ai.models.text };
  try {
    await db.execute(sql`select 1`);
    const postgres = { ready: true };
    const ok = postgres.ready && openai.ready && vision.ready && searxng.ready;
    return Response.json({ ok, readiness: { postgres, openai, anthropic: vision, searxng }, providers: { postgres: postgres.ready, openai: openai.ready, anthropic: vision.ready, searxng: searxng.ready }, models: aiModels(), deep }, { status: ok ? 200 : 503 });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    let dbTarget = "unknown";
    try { const raw = process.env.DATABASE_URL; if (raw) { const parsed = new URL(raw); dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`; } } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), dbTarget });
    return Response.json({ ok: false, readiness: { postgres: { ready: false }, openai, anthropic: vision, searxng }, providers: { postgres: false, openai: openai.ready, anthropic: vision.ready, searxng: searxng.ready }, models: aiModels(), deep }, { status: 503 });
  }
}
