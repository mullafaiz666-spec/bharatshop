import { GET as getStorefrontProducts } from "@/app/api/storefront/products/route";

export const dynamic = "force-dynamic";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

type Product = {
  id: number; sku: string; title: string; category: string; brand: string; imageUrl: string; imageUrls?: string[];
  sellingPriceInr: string; stockCount: number; madeToOrder?: boolean; aiMarketingCopy?: string;
  details?: { description?: string } | null;
};

const xml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const clean = (value: unknown) => String(value || "").replace(/(?:profit|margin|supplier|source|wholesale|dropship|commission)[^.!?]*[.!?]?/gi, "").replace(/\s{2,}/g, " ").trim();

export async function GET() {
  const response = await getStorefrontProducts(new Request(`${SITE_URL}/api/storefront/products?limit=192&sort=newest`));
  if (!response.ok) return new Response("Catalog unavailable", { status: 503 });
  const data = await response.json() as { products?: Product[] };
  const products = data.products || [];
  const items = products.map(product => {
    const description = clean(product.details?.description || product.aiMarketingCopy) || `Shop ${product.title} on BharatShop.`;
    const extraImages = (product.imageUrls || []).filter(url => url && url !== product.imageUrl).slice(0, 8);
    const available = product.madeToOrder || product.stockCount > 0;
    return `<item>
      <g:id>${xml(product.sku)}</g:id>
      <title>${xml(product.title)}</title>
      <description>${xml(description)}</description>
      <link>${xml(`${SITE_URL}/store/product/${product.id}`)}</link>
      <g:image_link>${xml(product.imageUrl)}</g:image_link>
      ${extraImages.map(url => `<g:additional_image_link>${xml(url)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${available ? "in_stock" : "out_of_stock"}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${Number(product.sellingPriceInr).toFixed(2)} INR</g:price>
      <g:brand>${xml(product.brand || "BharatShop")}</g:brand>
      <g:mpn>${xml(product.sku)}</g:mpn>
      <g:product_type>${xml(product.category)}</g:product_type>
    </item>`;
  }).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>BharatShop Product Feed</title>
    <link>${xml(SITE_URL)}</link>
    <description>Live verified BharatShop storefront products</description>
    ${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
