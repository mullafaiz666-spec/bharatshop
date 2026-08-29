import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Production database health check failed", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
