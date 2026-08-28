import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the BHARATSHOP CEO research agent. Investigate products using web search results supplied to you. Never claim an image, specification, price, stock, shipping promise, supplier relationship or authenticity is verified unless the evidence supports it. Compare independent sources when possible. Return concise structured evidence: PRODUCT, SOURCES, VERIFIED FACTS, IMAGE EVIDENCE, CONFLICTS, CONFIDENCE, MARGIN NOTES, CEO DECISION, NEXT ACTION. Reject suspicious or unsupported product claims. You can recommend actions, but never execute an irreversible supplier purchase.`;

async function searchWeb(query: string) {
  const key = process.env.BING_SEARCH_API_KEY || process.env.SERPAPI_API_KEY;
  if (!key) return [];
  if (process.env.SERPAPI_API_KEY) {
    const r = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_API_KEY}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.organic_results || []).slice(0, 8).map((x: any) => ({ title: x.title, url: x.link, snippet: x.snippet }));
  }
  const r = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=8`, { headers: { "Ocp-Apim-Subscription-Key": key } });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.webPages?.value || []).slice(0, 8).map((x: any) => ({ title: x.name, url: x.url, snippet: x.snippet }));
}

export async function POST(req: Request) {
  try {
    const { product, question, context } = await req.json();
    const q = String(product || question || "").trim();
    if (!q) return NextResponse.json({ error: "Product or research question required" }, { status: 400 });
    const results = await searchWeb(q);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ mode: "research-unavailable", results, message: results.length ? "Web evidence collected; configure OPENAI_API_KEY for CEO synthesis." : "Configure SERPAPI_API_KEY or BING_SEARCH_API_KEY plus OPENAI_API_KEY for live research." });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions: SYSTEM, input: `LIVE WEB RESULTS:\n${JSON.stringify(results).slice(0, 16000)}\n\nBUSINESS CONTEXT:\n${JSON.stringify(context || {}).slice(0, 6000)}\n\nRESEARCH REQUEST:\n${q}` })
    });
    if (!response.ok) return NextResponse.json({ mode: "research-evidence-only", results, message: "AI synthesis unavailable; raw web evidence returned." });
    const d = await response.json();
    return NextResponse.json({ mode: "ceo-research", results, analysis: String(d.output_text || "") });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Research failed" }, { status: 500 }); }
}
