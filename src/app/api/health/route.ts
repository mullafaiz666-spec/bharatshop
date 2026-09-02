import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkOpenAI(deep: boolean) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { configured: false, ready: false, reason: "missing" };
  try {
    const models = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!models.ok) return { configured: true, ready: false, status: models.status, reason: "provider_rejected_request" };
    if (!deep) return { configured: true, ready: true, status: models.status, reason: "reachable" };
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const res = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input: "health check", max_output_tokens: 1 }), cache: "no-store", signal: AbortSignal.timeout(15000) });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "model_ready" : "model_rejected", model };
  } catch { return { configured: true, ready: false, reason: "provider_unreachable" }; }
}

async function checkAnthropic(deep: boolean) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { configured: false, ready: false, reason: "missing" };
  try {
    const models = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!models.ok) return { configured: true, ready: false, status: models.status, reason: "provider_rejected_request" };
    if (!deep) return { configured: true, ready: true, status: models.status, reason: "reachable" };
    const model = process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5";
    // Deep readiness must exercise the actual vision content contract, not just
    // the text Messages API. This is a real authenticated Anthropic request.
    const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: [{ type: "text", text: "Return one word: OK" }, { type: "image", source: { type: "base64", media_type: "image/png", data: onePixelPng } }] }] }), cache: "no-store", signal: AbortSignal.timeout(20000) });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "vision_model_ready" : "vision_model_rejected", model };
  } catch { return { configured: true, ready: false, reason: "provider_unreachable" }; }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const [openai, anthropic] = await Promise.all([checkOpenAI(deep), checkAnthropic(deep)]);
  const providers = { openai: openai.ready, anthropic: anthropic.ready };
  try {
    await db.execute(sql`select 1`);
    const postgres = { ready: true };
    const ok = postgres.ready && openai.ready && anthropic.ready;
    return Response.json({ ok, readiness: { postgres, openai, anthropic }, providers, models: { openai: process.env.OPENAI_MODEL || "gpt-5.6-luna", anthropicVision: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5" }, deep }, { status: ok ? 200 : 503 });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeRecord = cause && typeof cause === "object" ? cause as Record<string, unknown> : undefined;
    let dbTarget = "unknown";
    try { const raw = process.env.DATABASE_URL; if (raw) { const parsed = new URL(raw); dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`; } } catch { dbTarget = "invalid-database-url"; }
    console.error("Production database health check failed", { message: error instanceof Error ? error.message : String(error), cause: cause instanceof Error ? cause.message : String(cause ?? ""), causeCode: typeof causeRecord?.code === "string" ? causeRecord.code : undefined, causeErrno: typeof causeRecord?.errno === "string" ? causeRecord.errno : undefined, causeSyscall: typeof causeRecord?.syscall === "string" ? causeRecord.syscall : undefined, dbTarget });
    return Response.json({ ok: false, readiness: { postgres: { ready: false }, openai, anthropic }, providers, deep }, { status: 503 });
  }
}
