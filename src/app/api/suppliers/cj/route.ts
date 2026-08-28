import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createCjOrder, ensureSupplierLinkTable, importCjProducts, searchCjProducts } from "@/lib/suppliers/cj";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getUserId() {
  const [u] = await db.select({ id: users.id }).from(users).orderBy(desc(users.id)).limit(1);
  return u?.id ?? 1;
}

export async function GET(req: Request) {
  try {
    if (!process.env.CJ_API_KEY) return NextResponse.json({ connected: false, error: "CJ_API_KEY is not configured." });
    const url = new URL(req.url);
    const keyword = url.searchParams.get("q") || undefined;
    const limit = Number(url.searchParams.get("limit") || 20);
    const products = await searchCjProducts({ keyword, limit, countryCode: url.searchParams.get("country") || "IN" });
    return NextResponse.json({ connected: true, provider: "cj", count: products.length, products });
  } catch (e) {
    return NextResponse.json({ connected: false, error: e instanceof Error ? e.message : "CJ request failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "IMPORT").toUpperCase();

    if (action === "HEALTH") {
      if (!process.env.CJ_API_KEY) return NextResponse.json({ connected: false, error: "CJ_API_KEY is not configured." });
      const products = await searchCjProducts({ keyword: "", limit: 1, countryCode: "IN" });
      return NextResponse.json({ connected: true, provider: "cj", sampleProducts: products.length });
    }

    if (action === "IMPORT") {
      const userId = await getUserId();
      const result = await importCjProducts({ keyword: body.keyword || undefined, limit: Number(body.limit || 20), userId });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "ENSURE_TABLE") {
      await ensureSupplierLinkTable();
      return NextResponse.json({ success: true });
    }

    if (action === "CREATE_ORDER") {
      if (process.env.CJ_LIVE_FULFILLMENT_ENABLED !== "true") {
        return NextResponse.json({ success: false, blocked: true, error: "Live supplier fulfillment is disabled. Set CJ_LIVE_FULFILLMENT_ENABLED=true only after supplier credentials, pricing, shipping, payment and return rules have been verified." }, { status: 409 });
      }
      const required = ["orderNumber", "shippingName", "phone", "address", "city", "state", "pincode", "productId", "quantity"];
      const missing = required.filter(k => body[k] === undefined || body[k] === null || body[k] === "");
      if (missing.length) return NextResponse.json({ success: false, error: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
      const result = await createCjOrder(body);
      return NextResponse.json({ success: true, provider: "cj", result });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Supplier operation failed" }, { status: 500 });
  }
}
