import { NextResponse } from "next/server";
import { db } from "@/db";
import { cartItems, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

export async function GET() {
  await ensureDemoDataSeeded();
  const all = await db.select().from(cartItems).orderBy(desc(cartItems.addedAt));
  return NextResponse.json({ cartItems: all });
}

// Add product to cart with custom selling price & margin
export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json();
    const { productId, quantity = 1, customSellingPriceInr, targetPlatform = "Meesho", notes = "" } = body;

    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

    const allProducts = await db.select().from(products).where(eq(products.id, Number(productId)));
    const product = allProducts[0];
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const cost = Number(product.supplierCostInr);
    const ship = Number(product.shippingCostInr);
    const gst = Number(product.gstPct);
    const price = customSellingPriceInr ? Number(customSellingPriceInr) : Number(product.sellingPriceInr);
    const netProfit = Number((price - cost - ship - (cost * gst / 100)).toFixed(2));
    const margin = price > 0 ? Number(((netProfit / price) * 100).toFixed(2)) : 0;

    const [created] = await db.insert(cartItems).values({
      userId,
      productId: product.id,
      productTitle: product.title,
      productImageUrl: product.imageUrl,
      sku: product.sku,
      quantity: Number(quantity),
      customSellingPriceInr: price.toFixed(2),
      supplierCostInr: cost.toFixed(2),
      shippingCostInr: ship.toFixed(2),
      gstPct: gst.toFixed(2),
      customMarginPct: margin.toFixed(2),
      netProfitInr: netProfit.toFixed(2),
      targetPlatform,
      notes,
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "Cart-AI // Margin Advisor",
      actionType: "CART_ITEM_ADDED",
      message: `"${product.title}" cart mein add kiya — ₹${price} selling price, ₹${netProfit}/unit profit (${margin}% margin) → ${targetPlatform}`,
      profitImpactInr: netProfit.toFixed(2),
      status: margin >= 35 ? "SUCCESS" : "WARNING",
    });

    return NextResponse.json({ cartItem: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

// Update cart item — change selling price, quantity, platform, margin
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, customSellingPriceInr, quantity, targetPlatform, notes } = body;
    if (!id) return NextResponse.json({ error: "Cart item ID required" }, { status: 400 });

    const existing = await db.select().from(cartItems).where(eq(cartItems.id, Number(id)));
    const item = existing[0];
    if (!item) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });

    const cost = Number(item.supplierCostInr);
    const ship = Number(item.shippingCostInr);
    const gst = Number(item.gstPct);
    const price = customSellingPriceInr !== undefined ? Number(customSellingPriceInr) : Number(item.customSellingPriceInr);
    const qty = quantity !== undefined ? Number(quantity) : item.quantity;
    const netProfit = Number((price - cost - ship - (cost * gst / 100)).toFixed(2));
    const margin = price > 0 ? Number(((netProfit / price) * 100).toFixed(2)) : 0;

    const [updated] = await db.update(cartItems).set({
      customSellingPriceInr: price.toFixed(2),
      quantity: qty,
      customMarginPct: margin.toFixed(2),
      netProfitInr: netProfit.toFixed(2),
      ...(targetPlatform && { targetPlatform }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(eq(cartItems.id, Number(id))).returning();

    await db.insert(aiActivityLogs).values({
      userId: updated.userId,
      agentName: "Cart-AI // Margin Advisor",
      actionType: "CART_MARGIN_ALERT",
      message: `Cart updated: "${updated.productTitle}" → ₹${updated.customSellingPriceInr} selling | ₹${updated.netProfitInr} profit (${updated.customMarginPct}% margin) | ${updated.targetPlatform}`,
      profitImpactInr: updated.netProfitInr,
      status: margin >= 35 ? "SUCCESS" : "WARNING",
    });

    return NextResponse.json({ cartItem: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Cart item ID required" }, { status: 400 });
    await db.delete(cartItems).where(eq(cartItems.id, Number(id)));
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
