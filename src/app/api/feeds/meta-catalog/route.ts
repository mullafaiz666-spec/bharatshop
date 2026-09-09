import { GET as getStorefrontProducts } from "@/app/api/storefront/products/route";

export const dynamic = "force-dynamic";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

type Product = {
  id: number; sku: string; title: string; category: string; brand: string; imageUrl: string; imageUrls?: string[];
  sellingPriceInr: string; stockCount: number; madeToOrder?: boolean; aiMarketingCopy?: string;
  details?: { description?: string } | null;
};

const clean = (value: unknown) => String(value || "").replace(/(?:profit|margin|supplier|source|wholesale|dropship|commission)[^.!?]*[.!?]?/gi, "").replace(/\s{2,}/g, " ").trim();
const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const response = await getStorefrontProducts(new Request(`${SITE_URL}/api/storefront/products?limit=192&sort=newest`));
  if (!response.ok) return new Response("Catalog unavailable", { status: 503 });
  const data = await response.json() as { products?: Product[] };
  const products = data.products || [];
  const header = ["id","title","description","availability","condition","price","link","image_link","brand","product_type","additional_image_link"].join(",");
  const rows = products.map(product => {
    const description = clean(product.details?.description || product.aiMarketingCopy) || `Shop ${product.title} on BharatShop.`;
    const available = product.madeToOrder || product.stockCount > 0;
    const extra = (product.imageUrls || []).filter(url => url && url !== product.imageUrl).slice(0, 8).join(",");
    return [
      product.sku,
      product.title,
      description,
      available ? "in stock" : "out of stock",
      "new",
      `${Number(product.sellingPriceInr).toFixed(2)} INR`,
      `${SITE_URL}/store/product/${product.id}`,
      product.imageUrl,
      product.brand || "BharatShop",
      product.category,
      extra,
    ].map(csv).join(",");
  });

  return new Response([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "inline; filename=meta-catalog.csv",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
