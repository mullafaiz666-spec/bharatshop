import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { productId } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
    const [p] = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const images = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    const verifiedImage = images.find(i => (i.verificationStatus === "VERIFIED" || i.verificationStatus === "WEB_SEARCH_MATCHED") && /^https?:\/\//i.test(i.imageUrl));
    if (!verifiedImage) return NextResponse.json({ status: "BLOCKED", error: "No verified source-backed image" }, { status: 422 });
    const selling = Number(p.sellingPriceInr), cost = Number(p.supplierCostInr) + Number(p.shippingCostInr), profit = selling - cost, margin = selling ? profit / selling * 100 : 0;
    if (selling <= 0 || profit <= 0 || Number(p.stockCount) <= 0) return NextResponse.json({ status: "BLOCKED", error: "Product failed profitability or stock gate" }, { status: 422 });
    const sourceUrl = verifiedImage.sourceUrl;
    const ai = await openAIJson("You are BharatShop Marketing and Listing Agent. Create truthful ecommerce copy from supplied facts only. Do not invent certifications, claims, discounts or specifications. Return JSON with title,description,marketingCopy,targetAudience,hook,cta.", { product: { brand: p.brand, title: p.title, sellingPriceInr: selling, stockCount: p.stockCount, source: p.supplierName, sourceUrl }, marginPct: +margin.toFixed(2) });
    const title = String(ai.title || p.title).trim(), description = String(ai.description || p.title).trim(), marketingCopy = String(ai.marketingCopy || ai.description || p.title).trim(), targetAudience = String(ai.targetAudience || "Online shoppers").trim();
    const listing = { title, description, sellingPriceInr: selling, marginPct: +margin.toFixed(2), netProfitInr: +profit.toFixed(2), marketingCopy, targetAudience, sourceEvidence: { imageUrl: verifiedImage.imageUrl, sourceUrl, sourceName: verifiedImage.altText, verificationStatus: verifiedImage.verificationStatus }, adCreativeData: { hook: String(ai.hook || marketingCopy), audience: targetAudience, imageUrl: verifiedImage.imageUrl, cta: String(ai.cta || "Abhi Kharido") } };
    await db.update(products).set({ imageUrl: verifiedImage.imageUrl, netProfitInr: listing.netProfitInr.toFixed(2), customMarginPct: listing.marginPct.toFixed(2), aiMarketingCopy: marketingCopy, aiTargetAudience: targetAudience, status: "Published", updatedAt: new Date() }).where(eq(products.id, p.id));
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "LISTING_OPTIMIZED", message: `OpenAI optimized listing for ${p.title}.`, profitImpactInr: String(listing.netProfitInr), metadataJson: { listing, ai }, status: "SUCCESS" });
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "STOREFRONT_PUBLISHED", message: `Published ${p.title} after marketing and catalogue gates.`, profitImpactInr: String(listing.netProfitInr), metadataJson: { productId: p.id, status: "Published" }, status: "SUCCESS" });
    return NextResponse.json({ listing, storefront: { published: true, productId: p.id, status: "Published" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 503 });
  }
}
export async function GET() { return NextResponse.json({ agent: "Listing-Creative-Agent", status: process.env.OPENAI_API_KEY ? "ready" : "blocked_missing_keys", capabilities: ["openai_copy", "positioning", "creative", "publication_gate"] }); }
