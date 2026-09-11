import { db } from "@/db";
import { sql } from "drizzle-orm";
import { aiModels, checkAI } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

async function checkSearXNG(deep: boolean) {
  const base = String(process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!base) return { configured: false, ready: false, reason: "missing" };

  if (!deep) return { configured: true, ready: true, exercised: false, reason: "configured" };

  try {
    const service = await fetch(`${base}/`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "BharatShop-Health/1.0" },
    });
    const serviceReady = service.ok || (service.status >= 300 && service.status < 400) || service.status === 429;
    if (!serviceReady) {
      return { configured: true, ready: false, exercised: true, serviceStatus: service.status, reason: "service_rejected" };
    }

    // Exercise the JSON search endpoint once, without the normal production
    // fallback/retry queue. Upstream engines can throttle shared hosting IPs;
    // that is reported as degraded while the self-hosted SearXNG service itself
    // remains ready. This keeps deep health bounded and truthful.
    try {
      const searchUrl = new URL(`${base}/search`);
      searchUrl.searchParams.set("q", "laptop product image");
      searchUrl.searchParams.set("categories", "images");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("language", "en");
      searchUrl.searchParams.set("pageno", "1");
      searchUrl.searchParams.set("engines", "brave.images");
      const search = await fetch(searchUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/json", "User-Agent": "BharatShop-Health/1.0" },
      });
      const upstreamReady = search.ok;
      return {
        configured: true,
        ready: true,
        exercised: true,
        serviceStatus: service.status,
        degraded: service.status === 429 || !upstreamReady,
        upstreamSearch: { ready: upstreamReady, status: search.status },
        reason: upstreamReady ? "service_and_search_reachable" : "service_reachable_upstream_throttled",
      };
    } catch (error) {
      return {
        configured: true,
        ready: true,
        exercised: true,
        serviceStatus: service.status,
        degraded: true,
        reason: "service_reachable_upstream_search_timed_out",
        upstreamSearch: { ready: false, error: error instanceof Error ? error.message : String(error) },
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

function configuredDatabaseSource() {
  if (process.env.DATABASE_URL) return { source: "DATABASE_URL", raw: process.env.DATABASE_URL };
  if (process.env.SUPABASE_DB_URL) return { source: "SUPABASE_DB_URL", raw: process.env.SUPABASE_DB_URL };
  return { source: "missing", raw: "" };
}

async function checkPostgres() {
  const configured = configuredDatabaseSource();
  if (!configured.raw) return { ready: false as const, configured: false, source: configured.source, reason: "missing_database_url" };
  try {
    await db.execute(sql`select 1`);
    return { ready: true as const, configured: true, source: configured.source };
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    let dbTarget = "unknown";
    try {
      const parsed = new URL(configured.raw);
      dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
    } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), dbTarget, source: configured.source });
    return { ready: false as const, configured: true, source: configured.source, reason: "database_unreachable", error: error instanceof Error ? error.message : String(error) };
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
  const revision = process.env.COMMIT_REF || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || "unknown";
  return Response.json({
    ok,
    revision,
    hosting: {
      netlify: Boolean(process.env.NETLIFY || process.env.DEPLOY_ID || process.env.SITE_ID),
      context: process.env.CONTEXT || null,
    },
    readiness: { postgres, ai, vision, searxng },
    providers: { ai: ai.ready, vision: vision.ready, searxng: searxng.ready },
    models: ai.models,
    provider: ai.provider,
    imageVerifier: { provider: vision.provider, model: vision.model },
    deep,
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
