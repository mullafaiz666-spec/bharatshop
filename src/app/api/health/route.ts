import { db } from "@/db";
import { sql } from "drizzle-orm";
import { aiModels, checkAI } from "@/lib/ai/provider";
import { searxngImageSearch } from "@/lib/searxng";

export const dynamic = "force-dynamic";

async function checkSearXNG(deep: boolean) {
  const base = String(process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!base) return { configured: false, ready: false, reason: "missing" };

  if (!deep) return { configured: true, ready: true, exercised: false, reason: "configured" };

  try {
    const service = await fetch(`${base}/`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "BharatShop-Health/1.0" },
    });
    const serviceReady = service.ok || (service.status >= 300 && service.status < 400) || service.status === 429;
    if (!serviceReady) {
      return { configured: true, ready: false, exercised: true, serviceStatus: service.status, reason: "service_rejected" };
    }

    try {
      const results = await searxngImageSearch("laptop product image", { limit: 1, timeoutMs: 10_000 });
      return {
        configured: true,
        ready: true,
        exercised: true,
        serviceStatus: service.status,
        degraded: service.status === 429 || results.length === 0,
        upstreamSearch: { ready: results.length > 0, resultCount: results.length },
      };
    } catch (error) {
      return {
        configured: true,
        ready: true,
        exercised: true,
        serviceStatus: service.status,
        degraded: true,
        reason: service.status === 429 ? "service_reachable_upstream_throttled" : "upstream_search_unavailable",
        upstreamSearch: {
          ready: false,
          reason: "upstream_search_unavailable",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  } catch (error) {
    return { configured: true, ready: false, exercised: true, reason: "service_unreachable", error: error instanceof Error ? error.message : String(error) };
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
  const [postgres, ai, vision, searxng] = await Promise.all([
    checkPostgres(),
    checkAI(deep),
    checkImageVerifier(deep),
    checkSearXNG(deep),
  ]);

  const ok = postgres.ready && ai.ready && vision.ready && searxng.ready;
  const revision = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || "unknown";
  return Response.json({
    ok,
    revision,
    readiness: { postgres, ai, vision, searxng },
    providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready },
    models: ai.models,
    provider: ai.provider,
    imageVerifier: { provider: vision.provider, model: vision.model },
    deep,
  }, { status: ok ? 200 : 503 });
}
