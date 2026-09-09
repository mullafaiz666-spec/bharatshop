import { NextResponse } from "next/server";
import { GOOGLE_INTELLIGENCE_POLICY, loadSharedAgentKnowledge, refreshGoogleIntelligence } from "@/lib/agents/live-intelligence";
import { pool } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const evidence = await loadSharedAgentKnowledge(20, "India ecommerce fashion streetwear marketing sourcing conversion");
    return NextResponse.json({
      status: evidence.length ? "READY" : "EMPTY",
      provider: "public-google-intelligence",
      policy: GOOGLE_INTELLIGENCE_POLICY,
      evidence,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google intelligence unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const refresh = await refreshGoogleIntelligence(Boolean(body.force));
    const evidence = await loadSharedAgentKnowledge(20, "India ecommerce fashion streetwear marketing sourcing conversion");
    await pool.query(
      `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
       VALUES (1,'Research Intelligence Agent','GOOGLE_PUBLIC_EVIDENCE_REFRESH',$1,$2,$3)`,
      [
        `Google-backed public intelligence refresh ${refresh.status.toLowerCase()}; ${evidence.length} recent evidence items available to the shared agent context.`,
        JSON.stringify({ refresh, evidenceCount: evidence.length, sources: GOOGLE_INTELLIGENCE_POLICY.sources }),
        refresh.status === "PARTIAL" ? "WARNING" : "SUCCESS",
      ]
    );
    return NextResponse.json({
      status: refresh.status,
      refresh,
      provider: "public-google-intelligence",
      sharedWithAllAgents: true,
      policy: GOOGLE_INTELLIGENCE_POLICY,
      evidence,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google intelligence refresh failed" }, { status: 503 });
  }
}
