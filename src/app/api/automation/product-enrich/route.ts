import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productDetails } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
import { criticalFirst } from "@/lib/catalog/priority-coverage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function auth(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-automation-token") || "";
  return !!expected && supplied === expected;
}

function isEvidenceEnriched(specs: unknown) {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return false;
  const value = specs as Record<string, unknown>;
  const provider = String(value.enrichmentProvider || "").trim();
  const enrichedAt = String(value.enrichedAt || "").trim();
  const sources = Array.isArray(value.verifiedEnrichmentSources) ? value.verifiedEnrichmentSources : [];
  return provider === "SearXNG+local-Gemma" && Boolean(enrichedAt) && sources.length > 0;
}

export async function POST(req: Request) {
  try {
    if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!process.env.SEARXNG_URL || !(process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL)) {
      return NextResponse.json({ error: "SearXNG and local AI provider are required" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(8, Number(body.limit || 3)));
    const rows = await db.select().from(products)
      .where(or(eq(products.status, "STAGED"), eq(products.status, "CEO_PENDING")))
      .orderBy(desc(products.id));
    const prioritized = criticalFirst(rows, p => ({ title: p.title, category: p.category, brand: p.brand }));

    const selected: Array<{ product: typeof products.$inferSelect; details: typeof productDetails.$inferSelect }> = [];
    for (const product of prioritized) {
      if (selected.length >= limit) break;
      const [details] = await db.select().from(productDetails).where(eq(productDetails.productId, product.id)).limit(1);
      if (!details || details.verificationStatus !== "SOURCE_VERIFIED" || !/^https?:\/\//i.test(String(details.sourceUrl || ""))) continue;
      if (isEvidenceEnriched(details.specificationsJson) && body.force !== true) continue;
      selected.push({ product, details });
    }

    const results: any[] = [];
    for (const { product, details } of selected) {
      try {
        const search = await serpSearch(`${product.title} ${product.brand} specifications features material dimensions warranty country of origin`, "google");
        const sources = (search.organic_results || []).slice(0, 8).map((x: any) => ({
          title: String(x.title || ""), link: String(x.link || ""), snippet: String(x.snippet || ""), source: String(x.source || ""),
        })).filter((x: any) => /^https?:\/\//i.test(x.link));

        if (!sources.length) { results.push({ productId: product.id, status: "NO_EVIDENCE" }); continue; }

        const out = await openAIJson(
          "You are BharatShop Product Enrichment Agent. Use ONLY the supplied web evidence and the already SOURCE_VERIFIED supplier URL. Never invent dimensions, weight, material, warranty, country of origin, included items, compatibility, certifications, variants or claims. Return JSON {description:string,specifications:object,includedItems:string,dimensions:string,weight:string,material:string,warranty:string,countryOfOrigin:string,careInstructions:string,variants:string[]}. Missing facts must be empty strings, empty arrays or omitted object fields.",
          { product: { title: product.title, brand: product.brand, category: product.category, supplier: product.supplierName, sourceUrl: details.sourceUrl }, sources },
        );

        const specifications = out.specifications && typeof out.specifications === "object" && !Array.isArray(out.specifications) ? out.specifications as Record<string, unknown> : {};
        const variants = Array.isArray(out.variants) ? out.variants.map(String).filter(Boolean) : [];
        const evidenceBacked = Boolean(String(out.description || "").trim() || Object.keys(specifications).length || String(out.includedItems || "").trim() || String(out.dimensions || "").trim() || String(out.weight || "").trim() || String(out.material || "").trim() || String(out.warranty || "").trim() || String(out.countryOfOrigin || "").trim() || String(out.careInstructions || "").trim() || variants.length);
        if (!evidenceBacked) { results.push({ productId: product.id, status: "NO_EXTRACTABLE_FACTS" }); continue; }

        const oldSpecs = details.specificationsJson && typeof details.specificationsJson === "object" && !Array.isArray(details.specificationsJson) ? details.specificationsJson as Record<string, unknown> : {};
        const mergedSpecs = { ...oldSpecs, ...specifications, verifiedEnrichmentSources: sources.map((s: any) => s.link), enrichmentProvider: "SearXNG+local-Gemma", enrichedAt: new Date().toISOString() };

        await db.update(productDetails).set({
          description: String(out.description || details.description || ""), specificationsJson: mergedSpecs, variantsJson: variants.length ? variants : details.variantsJson,
          includedItems: String(out.includedItems || details.includedItems || ""), dimensions: String(out.dimensions || details.dimensions || ""), weight: String(out.weight || details.weight || ""), material: String(out.material || details.material || ""), warranty: String(out.warranty || details.warranty || ""), countryOfOrigin: String(out.countryOfOrigin || details.countryOfOrigin || ""), careInstructions: String(out.careInstructions || details.careInstructions || ""), verificationStatus: "SOURCE_VERIFIED", sourceUrl: details.sourceUrl, verifiedAt: details.verifiedAt || new Date(), updatedAt: new Date(),
        }).where(eq(productDetails.productId, product.id));

        results.push({ productId: product.id, status: "ENRICHED", sourceCount: sources.length, specificationCount: Object.keys(mergedSpecs).length });
      } catch (error) {
        results.push({ productId: product.id, status: "ERROR", error: error instanceof Error ? error.message : String(error) });
      }
    }

    const errors = results.filter(x => x.status === "ERROR").length;
    return NextResponse.json({ status: errors ? "PARTIAL" : "COMPLETED", processed: selected.length, enriched: results.filter(x => x.status === "ENRICHED").length, errors, results, provider: "SearXNG+local-Gemma", selectionPolicy: "critical coverage buckets first, then newest source-verified products", policy: "Discovery/source metadata alone never counts as enrichment. Only evidence-backed customer facts mark a product enriched; SOURCE_VERIFIED supplier evidence is preserved." }, { status: errors ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product enrichment failed" }, { status: 500 });
  }
}

export async function GET() {
  const ai = Boolean(process.env.AI_BASE_URL || process.env.LOCAL_AI_BASE_URL);
  return NextResponse.json({ agent: "Product-Enrichment-Agent", status: process.env.SEARXNG_URL && ai ? "ready" : "blocked_missing_provider", provider: "SearXNG+local-Gemma", paidProvidersRequired: false, prerequisite: "SOURCE_VERIFIED", selectionPolicy: "critical-coverage-first then newest-first" });
}
