import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL("/api/storefront/products", req.url);
  url.searchParams.set("id", String(productId));
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  const product = Array.isArray(data?.products) ? data.products[0] : null;
  if (!response.ok || !product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product, privacy: "customer-safe-v2" }, { headers: { "Cache-Control": "no-store" } });
}
