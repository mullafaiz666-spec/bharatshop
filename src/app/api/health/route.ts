import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { configured: false, ready: false, reason: "missing" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "reachable" : "provider_rejected_request" };
  } catch (error) {
    return { configured: true, ready: false, reason: error instanceof Error ? "provider_unreachable" : "provider_check_failed" };
  }
}

async function checkAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { configured: false, ready: false, reason: "missing" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { configured: true, ready: res.ok, status: res.status, reason: res.ok ? "reachable" : "provider_rejected_request" };
  } catch (error) {
    return { configured: true, ready: false, reason: error instanceof Error ? "provider_unreachable" : "provider_check_failed" };
  }
}

export async function GET() {
  const [openai, anthropic] = await Promise.all([checkOpenAI(), checkAnthropic()]);
  const providers = {
    openai: openai.ready,
    anthropic: anthropic.ready,
  };

  try {
    await db.execute(sql`select 1`);
    const postgres = { ready: true };
    const ok = postgres.ready && openai.ready && anthropic.ready;

    return Response.json(
      {
        ok,
        readiness: {
          postgres,
          openai,
          anthropic,
        },
        providers,
        models: {
          openai: process.env.OPENAI_MODEL || "gpt-5.6-luna",
          anthropicVision: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5",
        },
      },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeRecord = cause && typeof cause === "object" ? cause as Record<string, unknown> : undefined;
    let dbTarget = "unknown";
    try {
      const raw = process.env.DATABASE_URL;
      if (raw) {
        const parsed = new URL(raw);
        dbTarget = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
      }
    } catch {
      dbTarget = "invalid-database-url";
    }
    console.error("Production database health check failed", {
      message: error instanceof Error ? error.message : String(error),
      cause: cause instanceof Error ? cause.message : String(cause ?? ""),
      causeCode: typeof causeRecord?.code === "string" ? causeRecord.code : undefined,
      causeErrno: typeof causeRecord?.errno === "string" ? causeRecord.errno : undefined,
      causeSyscall: typeof causeRecord?.syscall === "string" ? causeRecord.syscall : undefined,
      dbTarget,
    });
    return Response.json(
      {
        ok: false,
        readiness: {
          postgres: { ready: false },
          openai,
          anthropic,
        },
        providers,
      },
      { status: 503 },
    );
  }
}
