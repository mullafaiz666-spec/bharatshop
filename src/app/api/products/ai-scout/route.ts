import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    error: "Synthetic AI Scout product generation has been disabled in production.",
    code: "REAL_SOURCE_REQUIRED",
    provider: "SearXNG",
    nextStep: "Use the real Product Research Agent, then SearXNG -> Claude Vision -> PostgreSQL publication gating.",
  }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({
    agent: "AI-Product-Research-Agent",
    status: process.env.SEARXNG_URL && process.env.ANTHROPIC_API_KEY ? "ready" : "blocked_missing_provider",
    provider: "SearXNG->Claude Vision->PostgreSQL",
    syntheticData: false,
  });
}
