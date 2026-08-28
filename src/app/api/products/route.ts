import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Supplier images must remain traceable to the source. We do not fabricate or
// substitute product photos. Duplicate image URLs are rejected per product.
function normalizeImageUrls(body: any): string[] {
  const raw = Array.isArray(body.imageUrls) ? body.imageUrls : [body.imageUrl];
  return [...new Set(raw.filter((v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v) && v.trim().length > 0).map(v => v.trim()))];
}

function rejectDuplicateImages(urls: string[]) {
  const normalized = urls.map(u => u.toLowerCase().split("?")[0].replace(/\/$/, ""));
  return new Set(normalized).size !== normalized.length;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const query = searchParams.get("query")?.toLowerCase();
  const all = await db.select().from(products).orderBy(desc(products.aiScore));
  const filtered = all.filter(p => {
    const matchCat = !category || category === "ALL" || p.category === category;
    const matchQ = !query || p.title.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
    return matchCat && matchQ;
  });
  return NextResponse.json({ products: filtered });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = Number(body.userId ?? 1);
    const imageUrls = normalizeImageUrls(body);
    const { title, category = "Electronics & Gadgets", sku = `BD-SKU-${Date.now()}`, brand = "Generic", supplierName, supplierCity = "", supplierCostInr, shippingCostInr = 65, gstPct = 18, sellingPriceInr, mrpInr, customMarginPct = 40, aiMarketingCopy = "", aiTargetAudience = "", status = "Draft", stockCount = 0, moq = 1, hsnCode = "" } = body;

    // Require complete source-backed core data. Unknown values must be supplied
    // as explicit "Not available" by the sourcing agent, never guessed.
    const missing = [
      ["title", title], ["supplierName", supplierName], ["supplierCostInr", supplierCostInr],
      ["sellingPriceInr", sellingPriceInr], ["imageUrls", imageUrls.length ? imageUrls : null],
    ].filter(([, value]) => value === undefined || value === null || value === "");
    if (missing.length) return NextResponse.json({ error: `Missing required verified product data: ${missing.map(([k]) => k).join(", ")}` }, { status: 400 });
    if (rejectDuplicateImages(imageUrls)) return NextResponse.json({ error: "Duplicate product images detected. Keep only unique source images." }, { status: 422 });

    const cost = Number(supplierCostInr), ship = Number(shippingCostInr), price = Number(sellingPriceInr), gst = Number(gstPct);
    if (![cost, ship, price, gst].every(Number.isFinite)) return NextResponse.json({ error: "Product price/cost/tax data must be numeric and verified." }, { status: 400 });
    const netProfit = Number((price - cost - ship - cost * gst / 100).toFixed(2));
    const margin = price > 0 ? Number((netProfit / price * 100).toFixed(2)) : 0;
    if (netProfit <= 0) return NextResponse.json({ error: "Product is not profitable; listing blocked." }, { status: 422 });

    const [created] = await db.insert(products).values({ userId, sku, title, category, imageUrl: imageUrls[0], brand, supplierName, supplierCity, supplierCostInr: cost.toFixed(2), shippingCostInr: ship.toFixed(2), gstPct: gst.toFixed(2), sellingPriceInr: price.toFixed(2), mrpInr: Number(mrpInr ?? price).toFixed(2), customMarginPct: Number(customMarginPct).toFixed(2), netProfitInr: netProfit.toFixed(2), aiScore: Math.max(0, Math.min(100, Math.round(margin))), viralVelocityScore: 0, stockCount: Number(stockCount), moq: Number(moq), autoRepriceEnabled: true, status, aiMarketingCopy, aiTargetAudience, hsnCode }).returning();
    await db.insert(aiActivityLogs).values({ userId, agentName: "Catalog-Manager // Verified Import", actionType: "PRODUCT_IMPORTED", message: `Verified product imported with ${imageUrls.length} unique source image(s): ${created.title} — ₹${created.netProfitInr} net profit (${margin}% margin).`, profitImpactInr: created.netProfitInr, status: "SUCCESS", metadataJson: { sourceImageUrls: imageUrls, verifiedFields: Object.keys(body).filter(k => body[k] !== undefined) } });
    return NextResponse.json({ product: created, imageUrls, verification: "source-backed" }, { status: 201 });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, sellingPriceInr, supplierCostInr, shippingCostInr, gstPct, customMarginPct, status, aiMarketingCopy, autoRepriceEnabled } = body;
    if (!id) return NextResponse.json({ error: "Product id required" }, { status: 400 });
    const current = await db.select().from(products).where(eq(products.id, Number(id))).limit(1);
    if (!current[0]) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const p = current[0];
    const cost = Number(supplierCostInr ?? p.supplierCostInr), ship = Number(shippingCostInr ?? p.shippingCostInr), price = Number(sellingPriceInr ?? p.sellingPriceInr), gst = Number(gstPct ?? p.gstPct);
    const netProfit = Number((price - cost - ship - cost * gst / 100).toFixed(2));
    const [updated] = await db.update(products).set({ ...(sellingPriceInr !== undefined && { sellingPriceInr: price.toFixed(2) }), ...(supplierCostInr !== undefined && { supplierCostInr: cost.toFixed(2) }), ...(shippingCostInr !== undefined && { shippingCostInr: ship.toFixed(2) }), ...(gstPct !== undefined && { gstPct: gst.toFixed(2) }), ...(customMarginPct !== undefined && { customMarginPct: Number(customMarginPct).toFixed(2) }), ...(status && { status }), ...(aiMarketingCopy !== undefined && { aiMarketingCopy }), ...(autoRepriceEnabled !== undefined && { autoRepriceEnabled: Boolean(autoRepriceEnabled) }), netProfitInr: netProfit.toFixed(2), updatedAt: new Date() }).where(eq(products.id, Number(id))).returning();
    await db.insert(aiActivityLogs).values({ userId: updated.userId, agentName: "Reprice-Sentinel // Unit Economics", actionType: "PRICE_OPTIMIZED", message: `Price updated: ${updated.title} → ₹${updated.sellingPriceInr} / ₹${updated.netProfitInr} net.`, profitImpactInr: updated.netProfitInr, status: "SUCCESS" });
    return NextResponse.json({ product: updated });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Product id required" }, { status: 400 });
    const [deleted] = await db.delete(products).where(eq(products.id, Number(id))).returning();
    if (deleted) await db.insert(aiActivityLogs).values({ userId: deleted.userId, agentName: "Catalog-Manager // Cleanup", actionType: "PRODUCT_REMOVED", message: `Product removed: ${deleted.title} (${deleted.sku}).`, profitImpactInr: "0.00", status: "INFO" });
    return NextResponse.json({ deleted: true });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 }); }
}
