import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, productDetails, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";

export const dynamic = "force-dynamic";
const MIN_IMAGES=4;const MAX_IMAGES=8;const MIN_CONFIDENCE=0.75;
const VERIFIED_MEDIA=new Set(["AI_VISION_VERIFIED","LOCAL_EVIDENCE_VERIFIED"]);const VERIFIED_PROVIDERS=new Set(["local-ai","local-evidence"]);

export async function POST(req: Request) {
  try {
    const { productId, ceoApproved } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
    const [p] = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
    if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    if (p.status !== "CEO_APPROVED" || ceoApproved !== true) {
      return NextResponse.json({ status: "BLOCKED", error: "CEO approval is required before storefront publication" }, { status: 403 });
    }

    const [details]=await db.select().from(productDetails).where(eq(productDetails.productId,p.id)).limit(1);
    if(!details||details.verificationStatus!=="SOURCE_VERIFIED"||!/^https?:\/\//i.test(String(details.sourceUrl||"")))return NextResponse.json({status:"BLOCKED",error:"Persisted SOURCE_VERIFIED supplier evidence is required"},{status:422});
    const specs=details.specificationsJson;const hasSpecs=Boolean(specs&&typeof specs==="object"&&Object.keys(specs as Record<string,unknown>).length>0);
    if(!hasSpecs)return NextResponse.json({status:"BLOCKED",error:"Evidence-backed product specifications are required"},{status:422});

    const images = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    const verifiedImages = images.filter(i => VERIFIED_MEDIA.has(String(i.verificationStatus))&&VERIFIED_PROVIDERS.has(String(i.verificationProvider))&&Number(i.verificationConfidence)>=MIN_CONFIDENCE&&!!i.verifiedAt&&/^https:\/\//i.test(i.imageUrl)&&/^https?:\/\//i.test(i.sourceUrl)).sort((a,b)=>a.sortOrder-b.sortOrder).slice(0,MAX_IMAGES);
    if (verifiedImages.length<MIN_IMAGES) return NextResponse.json({ status: "BLOCKED", error: `At least ${MIN_IMAGES} verified source-backed images are required` }, { status: 422 });

    const selling = Number(p.sellingPriceInr);
    const cost = Number(p.supplierCostInr) + Number(p.shippingCostInr) + Number(p.supplierCostInr) * Number(p.gstPct) / 100;
    const profit = selling - cost;
    const margin = selling ? profit / selling * 100 : 0;
    if (selling <= 0 || profit <= 0 || Number(p.stockCount) <= 0) return NextResponse.json({ status: "BLOCKED", error: "Product failed profitability or stock gate" }, { status: 422 });

    const sourceUrl = details.sourceUrl;
    let ai: any = {};
    let copyProvider = "verified-facts-fallback";
    let aiError = "";
    try {
      ai = await openAIJson("You are BharatShop Marketing and Listing Agent running on the configured local Gemma provider. Create truthful ecommerce copy from supplied verified facts only. Do not invent certifications, claims, discounts or specifications. Return JSON with title,description,marketingCopy,targetAudience,hook,cta.", { product: { brand: p.brand, title: p.title, sellingPriceInr: selling, stockCount: p.stockCount, source: p.supplierName, sourceUrl, specifications: specs }, marginPct: +margin.toFixed(2) });
      copyProvider = "local-Gemma";
    } catch (error) {
      aiError = error instanceof Error ? error.message : String(error);
      ai = {};
    }

    const factualFallback = `${p.title}. Available from a verified supplier source with current pricing and stock evidence.`;
    const title = String(ai.title || p.title).trim();
    const description = String(ai.description || details.description || factualFallback).trim();
    const marketingCopy = String(ai.marketingCopy || description || factualFallback).trim();
    const targetAudience = String(ai.targetAudience || p.aiTargetAudience || "Indian online shoppers").trim();
    const listing = { title, description, sellingPriceInr: selling, marginPct: +margin.toFixed(2), netProfitInr: +profit.toFixed(2), marketingCopy, targetAudience, copyProvider, sourceEvidence: { sourceUrl, sourceName:p.supplierName, verificationStatus:details.verificationStatus }, mediaEvidence:verifiedImages.map(i=>({imageUrl:i.imageUrl,sourceUrl:i.sourceUrl,verificationStatus:i.verificationStatus,confidence:Number(i.verificationConfidence),provider:i.verificationProvider})), adCreativeData: { hook: String(ai.hook || marketingCopy), audience: targetAudience, imageUrl: verifiedImages[0].imageUrl, cta: String(ai.cta || "Shop Now") } };

    await db.update(products).set({ imageUrl: verifiedImages[0].imageUrl, netProfitInr: listing.netProfitInr.toFixed(2), customMarginPct: listing.marginPct.toFixed(2), aiMarketingCopy: marketingCopy, aiTargetAudience: targetAudience, status: "Published", updatedAt: new Date() }).where(eq(products.id, p.id));
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "LISTING_OPTIMIZED", message: `${copyProvider === "local-Gemma" ? "Local Gemma" : "Verified-facts fallback"} prepared CEO-approved listing for ${p.title}.`, profitImpactInr: String(listing.netProfitInr), metadataJson: { listing, ai, aiError, ceoApproved: true, provider:copyProvider }, status: aiError ? "WARNING" : "SUCCESS" });
    await db.insert(aiActivityLogs).values({ userId: p.userId, agentName: "Listing-Creative-Agent", actionType: "STOREFRONT_PUBLISHED", message: `Published ${p.title} after SOURCE_VERIFIED, media, specification, economics and CEO gates.`, profitImpactInr: String(listing.netProfitInr), metadataJson: { productId: p.id, status: "Published", ceoApproved: true, verifiedImageCount:verifiedImages.length, copyProvider }, status: "SUCCESS" });
    return NextResponse.json({ listing, storefront: { published: true, productId: p.id, status: "Published" }, aiFallbackUsed: Boolean(aiError) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ agent: "Listing-Creative-Agent", status: process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL ? "ready" : "ready_with_verified_facts_fallback", provider:"local-Gemma with verified-facts fallback", publicationGate: "SOURCE_VERIFIED + 4-8 verified media + specs + economics + CEO", capabilities: ["local_ai_copy", "verified_facts_fallback", "positioning", "creative", "source_gate", "verified_media_gate", "publication_gate"] });
}
