import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
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
    return Response.json({ ok: false }, { status: 500 });
  }
}
