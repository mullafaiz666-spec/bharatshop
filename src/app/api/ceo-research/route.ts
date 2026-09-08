import { serpSearch } from "@/lib/ai/agent-tools";
import { runText } from "@/lib/ai/provider";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the BHARATSHOP CEO research agent. Investigate products using web search results supplied to you. Never claim an image, specification, price, stock, shipping promise, supplier relationship or authenticity is verified unless the evidence supports it. Compare independent sources when possible. Return concise structured evidence: PRODUCT, SOURCES, VERIFIED FACTS, IMAGE EVIDENCE, CONFLICTS, CONFIDENCE, MARGIN NOTES, CEO DECISION, NEXT ACTION. Reject suspicious or unsupported product claims. You can recommend actions, but never execute an irreversible supplier purchase.`;

async function searchWeb(query: string) { return (await serpSearch(query)).organic_results; }

export async function POST(req: Request) {
  try {
    const { product, question, context } = await req.json();
    const q = String(product || question || "").trim();
    if (!q) return NextResponse.json({ error: "Product or research question required" }, { status: 400 });
    const results = await searchWeb(q);
    if (!results.length) return NextResponse.json({ error: "No source evidence returned", results }, { status: 422 });
    const response = await runText([{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({results,context:context||{},question:q})}]);
    return NextResponse.json({ mode: "ceo-research", results, analysis: response.content });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Research failed" }, { status: 500 }); }
}
