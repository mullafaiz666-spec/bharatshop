import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

const INDIAN_CITIES = [
  { city: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { city: "Delhi", state: "Delhi", pincode: "110001" },
  { city: "Bengaluru", state: "Karnataka", pincode: "560001" },
  { city: "Ahmedabad", state: "Gujarat", pincode: "380001" },
  { city: "Chennai", state: "Tamil Nadu", pincode: "600001" },
  { city: "Hyderabad", state: "Telangana", pincode: "500001" },
  { city: "Kolkata", state: "West Bengal", pincode: "700001" },
  { city: "Pune", state: "Maharashtra", pincode: "411001" },
  { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
  { city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
];

const CUSTOMERS = [
  { name: "Anjali Singh", email: "anjali.singh@gmail.com", phone: "9876543210" },
  { name: "Rohit Gupta", email: "rohit.gupta@yahoo.in", phone: "9988112233" },
  { name: "Kavita Sharma", email: "kavita.sharma@rediffmail.com", phone: "9765432100" },
  { name: "Suresh Nair", email: "suresh.nair@gmail.com", phone: "8899001122" },
  { name: "Deepika Patel", email: "deepika.p@outlook.com", phone: "9900112233" },
];

const CARRIERS = ["Delhivery Surface", "Ekart Logistics", "Shiprocket", "Amazon Logistics", "DTDC Express"];
const PAYMENT_MODES = ["COD", "UPI", "Card", "Net Banking"];

export async function GET() {
  await ensureDemoDataSeeded();
  const allOrders = await db.select().from(orders).orderBy(desc(orders.orderedAt));
  return NextResponse.json({ orders: allOrders });
}

export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json().catch(() => ({}));

    const allProducts = await db.select().from(products);
    const target = allProducts.find(p => p.id === body.productId) || allProducts[Math.floor(Math.random() * allProducts.length)];
    if (!target) return NextResponse.json({ error: "No products" }, { status: 400 });

    const location = INDIAN_CITIES[Math.floor(Math.random() * INDIAN_CITIES.length)];
    const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    const qty = Number(body.quantity) || 1;
    const paid = (Number(target.sellingPriceInr) * qty).toFixed(2);
    const cost = ((Number(target.supplierCostInr) + Number(target.shippingCostInr)) * qty).toFixed(2);
    const gstAmt = ((Number(target.supplierCostInr) * Number(target.gstPct) / 100) * qty).toFixed(2);
    const platformComm = (Number(paid) * 0.08).toFixed(2);
    const netProfit = (Number(paid) - Number(cost) - Number(gstAmt) - Number(platformComm)).toFixed(2);
    const orderNo = `BD-M-${Math.floor(10500 + Math.random() * 900)}`;
    const carrier = CARRIERS[Math.floor(Math.random() * CARRIERS.length)];
    const payMode = PAYMENT_MODES[Math.floor(Math.random() * PAYMENT_MODES.length)];

    const [created] = await db.insert(orders).values({
      userId,
      storeId: target.storeId,
      orderNumber: orderNo,
      customerName: body.customerName || customer.name,
      customerEmail: body.customerEmail || customer.email,
      customerPhone: body.customerPhone || customer.phone,
      customerCity: body.customerCity || location.city,
      customerState: body.customerState || location.state,
      customerPincode: body.customerPincode || location.pincode,
      productId: target.id,
      productTitle: target.title,
      quantity: qty,
      customerPaidInr: paid,
      supplierCostInr: cost,
      gstAmountInr: gstAmt,
      platformCommissionInr: platformComm,
      netProfitInr: netProfit,
      fulfillmentStatus: "Incoming",
      supplierTrackingCode: "PENDING_AI_QUEUE",
      carrierName: carrier,
      paymentMode: payMode,
      aiDecisionLog: `${payMode} order from ${location.city}, ${location.state}. Fraud check: SAFE. Auto-fulfillment queued.`,
    }).returning();

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "Store-Webhook // Incoming Order",
      actionType: "ORDER_RECEIVED",
      message: `Naya order ${orderNo} — ${customer.name} (${location.city}) ne ${target.title} kharida. Net Profit: ₹${netProfit}`,
      profitImpactInr: netProfit,
      status: "INFO",
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, fulfillmentStatus, supplierTrackingCode, aiDecisionLog } = body;
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    const tracking = supplierTrackingCode || (
      ["Auto-Ordered","In Transit","Delivered"].includes(fulfillmentStatus)
        ? `DELHIVERY${Math.floor(1000000 + Math.random() * 9000000)}`
        : undefined
    );

    const [updated] = await db.update(orders).set({
      ...(fulfillmentStatus && { fulfillmentStatus }),
      ...(tracking && { supplierTrackingCode: tracking }),
      ...(aiDecisionLog && { aiDecisionLog }),
      ...(fulfillmentStatus === "Delivered" && { fulfilledAt: new Date() }),
    }).where(eq(orders.id, Number(id))).returning();

    await db.insert(aiActivityLogs).values({
      userId: updated.userId,
      agentName: "Fulfillment-Core // Pipeline",
      actionType: "ORDER_FULFILLED",
      message: `Order ${updated.orderNumber} → "${updated.fulfillmentStatus}" | Tracking: ${updated.supplierTrackingCode}`,
      profitImpactInr: updated.netProfitInr,
      status: "SUCCESS",
    });

    return NextResponse.json({ order: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    await db.delete(orders).where(eq(orders.id, Number(id)));
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
