import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    console.error("Production database health check failed", {
      message: error instanceof Error ? error.message : String(error),
      cause: cause instanceof Error ? cause.message : String(cause ?? ""),
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
