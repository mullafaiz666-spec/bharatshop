import { db } from "@/db";
import { sql } from "drizzle-orm";
import { checkAI } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const ai = await checkAI(deep);
  try {
    await db.execute(sql`select 1`);
    const postgres = { ready: true };
    const ok = postgres.ready && ai.ready;
    return Response.json({ ok, readiness: { postgres, ai }, providers: { ai: ai.ready }, models: ai.models, provider: ai.provider, deep }, { status: ok ? 200 : 503 });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    let dbTarget = "unknown";
    try { const raw = process.env.DATABASE_URL; if (raw) { const parsed = new URL(raw); dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`; } } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), dbTarget });
    return Response.json({ ok: false, readiness: { postgres: { ready: false }, ai }, providers: { ai: ai.ready }, deep }, { status: 503 });
  }
}
