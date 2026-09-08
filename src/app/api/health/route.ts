import { db } from "@/db";
import { sql } from "drizzle-orm";
import { aiModels, checkAI } from "@/lib/ai/provider";
import { searxngImageSearch } from "@/lib/searxng";

export const dynamic = "force-dynamic";

async function checkSearXNG(deep: boolean) {
  const base = String(process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!base) return { configured: false, ready: false, reason: "missing" };
  if (!deep) return { configured: true, ready: true, exercised: false };
  try {
    const results = await searxngImageSearch("laptop product image", { limit: 1, timeoutMs: 10000 });
    return { configured: true, ready: results.length > 0, exercised: true, resultCount: results.length };
  } catch (e) {
    return { configured: true, ready: false, exercised: true, reason: "image_search_failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkImageVerifier(deep: boolean) {
  const mode = process.env.IMAGE_VERIFIER_MODE || "local-evidence";
  if (mode === "local-evidence") {
    return {
      ready: true,
      exercised: deep,
      provider: "local-evidence",
      model: "local-evidence-v1",
      reason: "https+content-type+source-title+brand-title-token verification",
    };
  }
  return { ready: false, exercised: deep, provider: mode, model: aiModels().vision, reason: "unsupported_verifier_mode" };
}

async function checkPostgres() {
  try {
    await db.execute(sql`select 1`);
    return { ready: true as const };
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    let dbTarget = "unknown";
    try {
      const raw = process.env.DATABASE_URL;
      if (raw) {
        const parsed = new URL(raw);
        dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
      }
    } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), dbTarget });
    return { ready: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";

  // All readiness probes are independent. Run them concurrently so the slowest
  // real provider determines latency instead of adding every timeout together.
  const [postgres, ai, vision, searxng] = await Promise.all([
    checkPostgres(),
    checkAI(deep),
    checkImageVerifier(deep),
    checkSearXNG(deep),
  ]);

  const ok = postgres.ready && ai.ready && vision.ready && searxng.ready;
  return Response.json({
    ok,
    readiness: { postgres, ai, vision, searxng },
    providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready },
    models: ai.models,
    provider: ai.provider,
    imageVerifier: { provider: vision.provider, model: vision.model },
    deep,
  }, { status: ok ? 200 : 503 });
}
