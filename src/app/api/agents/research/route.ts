import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getAdminUser } from "@/lib/admin-auth";
import { DEFAULT_RESEARCH_TOPICS, publicWebResearch } from "@/lib/ai/web-research";

export const dynamic = "force-dynamic";

function authorizedAutomation(request: Request) {
  const configured = process.env.BHARATSHOP_AUTOMATION_TOKEN?.trim();
  const supplied = request.headers.get("x-bharatshop-automation-token")?.trim();
  return Boolean(configured && supplied && supplied === configured);
}

function confidenceFor(sources: Array<{ url: string; title: string; snippet: string }>) {
  if (!sources.length) return 0;
  const domains = new Set<string>();
  for (const source of sources) {
    try { domains.add(new URL(source.url).hostname.replace(/^www\./, "")); } catch {}
  }
  const sourceScore = Math.min(sources.length / 8, 1) * 60;
  const diversityScore = Math.min(domains.size / 5, 1) * 25;
  const evidenceScore = sources.filter((source) => source.snippet.length >= 80 && source.title.length >= 8).length / sources.length * 15;
  return Math.round(Math.min(100, sourceScore + diversityScore + evidenceScore) * 100) / 100;
}

function learningSummary(topic: string, confidence: number, sourceCount: number) {
  return `Research finding for ${topic}. Evidence confidence ${confidence}/100 from ${sourceCount} public/authorized sources. This is an input to learning and experimentation; it does not directly publish products, spend money, or message customers.`;
}

export async function GET() {
  return NextResponse.json({
    agent: "research-learning",
    status: process.env.GOOGLE_RESEARCH_ENDPOINT || process.env.SEARXNG_URL ? "configured" : "blocked_missing_search_provider",
    topics: DEFAULT_RESEARCH_TOPICS,
    policy: "public-authorized-only",
    raw_google_scraping: false,
  });
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin && !authorizedAutomation(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const topics = Array.isArray(body?.topics) && body.topics.length
      ? body.topics.map(String).map((x: string) => x.trim()).filter(Boolean).slice(0, 10)
      : DEFAULT_RESEARCH_TOPICS;
    const limit = Math.min(Math.max(Number(body?.limit || 8), 1), 20);
    const results = [];

    for (const topic of topics) {
      const result = await publicWebResearch(topic, limit);
      const confidence = confidenceFor(result.sources);
      const verificationStatus = confidence >= 70 ? "VERIFIED" : confidence >= 45 ? "REVIEW" : "UNVERIFIED";
      const summary = learningSummary(topic, confidence, result.sources.length);

      await db.execute(sql`
        INSERT INTO research_findings
          (query, source, sources_json, confidence, verification_status, learning_summary, created_at, updated_at)
        VALUES
          (${topic}, ${result.sources[0]?.source ?? "unknown"}, ${JSON.stringify(result.sources)}::jsonb,
           ${confidence}, ${verificationStatus}, ${summary}, NOW(), NOW())
      `);

      results.push({ ...result, confidence, verificationStatus, learningSummary: summary });
    }

    return NextResponse.json({
      agent: "research-learning",
      status: "research_complete",
      persisted: true,
      results,
      next: "Learning Agent can consume VERIFIED findings, compare them with BharatShop performance, propose experiments, and route consequential actions through CEO approval/guardrails.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 503 });
  }
}
