import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

export async function GET(req: Request) {
  await ensureDemoDataSeeded();
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
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json();
    const {
      title, category = "Electronics & Gadgets",
      sku = `BD-SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      imageUrl = "https://images.unsplash.com/photo-1625948515291-69bc9a6f8c87?w=600&auto=format&fit=crop&q=80",
      brand = "Generic",
      supplierName = "Surat Wholesale Market",
      supplierCostInr = 300, shippingCostInr = 65, gstPct = 18,
      sellingPriceInr = 799, mrpInr = 1299,
      customMarginPct = 40,
      aiMarketingCopy = "AI-scouted high-margin Indian dropshipping winner.",
      aiTargetAudience = "Indian online shoppers",
      status = "Published",
    } = body;

    const cost = Number(supplierCostInr);
    const ship = Number(shippingCostInr);
    const price = Number(sellingPriceInr);
    const gst = Number(gstPct);
    const netProfit = Number((price - cost - ship - (cost * gst / 100)).toFixed(2));
    const margin = Number(((netProfit / price) * 100).toFixed(2));

    const [created] = await db.insert(products).values({
      userId, sku, title, category, imageUrl, brand, supplierName,
      supplierCostInr: cost.toFixed(2),
      shippingCostInr: ship.toFixed(2),
      gstPct: gst.toFixed(2),
      sellingPriceInr: price.toFixed(2),
      mrpInr: Number(mrpInr).toFixed(2),
      customMarginPct: Number(customMarginPct).toFixed(2),
      netProfitInr: netProfit.toFixed(2),
      aiScore: Math.floor(88 + Math.random() * 12),
      viralVelocityScore: Math.floor(82 + Math.random() * 18),
      stockCount: 500, moq: 1, autoRepriceEnabled: true,
      status, aiMarketingCopy, aiTargetAudience,
      hsnCode: "85176990",
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "Scout-AI // Product Importer",
      actionType: "PRODUCT_IMPORTED",
      message: `"${created.title}" ko catalog mein add kiya — ₹${created.netProfitInr}/unit net profit (${created.customMarginPct}% margin)`,
      profitImpactInr: created.netProfitInr,
      status: "SUCCESS",
    });

    return NextResponse.json({ product: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, sellingPriceInr, supplierCostInr, shippingCostInr, gstPct, customMarginPct, status, aiMarketingCopy, autoRepriceEnabled } = body;
    if (!id) return NextResponse.json({ error: "Product id required" }, { status: 400 });

    const cost = Number(supplierCostInr);
    const ship = Number(shippingCostInr ?? 65);
    const price = Number(sellingPriceInr);
    const gst = Number(gstPct ?? 18);
    const netProfit = Number((price - cost - ship - (cost * gst / 100)).toFixed(2));
    const margin = Number(((netProfit / price) * 100).toFixed(2));

    const [updated] = await db.update(products).set({
      ...(sellingPriceInr !== undefined && { sellingPriceInr: price.toFixed(2) }),
      ...(supplierCostInr !== undefined && { supplierCostInr: cost.toFixed(2) }),
      ...(shippingCostInr !== undefined && { shippingCostInr: ship.toFixed(2) }),
      ...(gstPct !== undefined && { gstPct: gst.toFixed(2) }),
      ...(customMarginPct !== undefined && { customMarginPct: Number(customMarginPct).toFixed(2) }),
      ...(status && { status }),
      ...(aiMarketingCopy !== undefined && { aiMarketingCopy }),
      ...(autoRepriceEnabled !== undefined && { autoRepriceEnabled: Boolean(autoRepriceEnabled) }),
      netProfitInr: netProfit.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(products.id, Number(id))).returning();

    await db.insert(aiActivityLogs).values({
      userId: updated.userId,
      agentName: "Reprice-Sentinel // Unit Economics",
      actionType: "PRICE_OPTIMIZED",
      message: `"${updated.title}" updated → Selling ₹${updated.sellingPriceInr} | Net ₹${updated.netProfitInr} (${updated.customMarginPct}% margin)`,
      profitImpactInr: updated.netProfitInr,
      status: "SUCCESS",
    });

    return NextResponse.json({ product: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Product id required" }, { status: 400 });
    const [deleted] = await db.delete(products).where(eq(products.id, Number(id))).returning();
    if (deleted) {
      await db.insert(aiActivityLogs).values({
        userId: deleted.userId,
        agentName: "Catalog-Manager // Cleanup",
        actionType: "PRODUCT_REMOVED",
        message: `"${deleted.title}" (${deleted.sku}) catalog se remove kiya.`,
        profitImpactInr: "0.00",
        status: "INFO",
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
