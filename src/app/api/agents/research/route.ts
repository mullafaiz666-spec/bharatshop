import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { DEFAULT_RESEARCH_TOPICS, publicWebResearch } from "@/lib/ai/web-research";

export const dynamic = "force-dynamic";

function authorizedAutomation(request: Request) {
  const configured = process.env.BHARATSHOP_AUTOMATION_TOKEN?.trim();
  const supplied = request.headers.get("x-bharatshop-automation-token")?.trim();
  return Boolean(configured && supplied && supplied === configured);
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
    for (const topic of topics) results.push(await publicWebResearch(topic, limit));

    return NextResponse.json({
      agent: "research-learning",
      status: "research_complete",
      results,
      next: "Persist verified findings into the learning store and let CEO/agents act only through approved tools.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 503 });
  }
}
