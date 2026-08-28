import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

const BAD_IMAGE = /(?:unsplash\.com|source\.unsplash\.com|via\.placeholder\.com|placeholder\.com|placehold\.co|placehold\.it|dummyimage\.com|picsum\.photos|loremflickr\.com|placekitten\.com)/i;
const cleanUrl = (value: unknown) => {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) && !BAD_IMAGE.test(url) ? url : "";
};

export async function GET(req: Request) {
  await ensureDemoDataSeeded();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || searchParams.get("query") || "";
  const sort = searchParams.get("sort") || "aiScore";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "24", 10) || 24, 1), 96);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const featured = searchParams.get("featured") === "true";

  const all = await db.select().from(products).orderBy(desc(products.aiScore));
  const imageRows = await db.select().from(productImages);
  const galleryMap = new Map<number, string[]>();
  for (const row of imageRows) {
    const url = cleanUrl(row.imageUrl);
    if (!url || !["VERIFIED", "WEB_SEARCH_MATCHED"].includes(String(row.verificationStatus))) continue;
    const current = galleryMap.get(row.productId) || [];
    if (!current.includes(url)) current.push(url);
    galleryMap.set(row.productId, current.slice(0, 5));
  }

  let filtered = all.filter(p => p.status === "Published");
  if (featured) filtered = filtered.filter(p => p.aiScore >= 92);
  if (category && category !== "ALL") filtered = filtered.filter(p => p.category === category);
  if (search) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(p => p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }
  if (sort === "price_low") filtered.sort((a, b) => Number(a.sellingPriceInr) - Number(b.sellingPriceInr));
  else if (sort === "price_high") filtered.sort((a, b) => Number(b.sellingPriceInr) - Number(a.sellingPriceInr));
  else if (sort === "newest") filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  else if (sort === "popular") filtered.sort((a, b) => b.salesCount24h - a.salesCount24h);
  else filtered.sort((a, b) => b.aiScore - a.aiScore);

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  // Never expose supplier identity, supplier cost, sourcing URLs, internal scores, or operations to customers.
  const customerProducts = paginated.map(p => {
    const gallery = galleryMap.get(p.id) || [];
    const primary = cleanUrl(p.imageUrl);
    const imageUrls = Array.from(new Set([...(gallery.length ? gallery : []), primary].filter(Boolean))).slice(0, 5);
    return {
      id: p.id,
      sku: p.sku,
      title: p.title,
      category: p.category,
      brand: p.brand,
      imageUrl: imageUrls[0] || "",
      imageUrls,
      sellingPriceInr: p.sellingPriceInr,
      mrpInr: p.mrpInr,
      stockCount: p.stockCount,
      aiMarketingCopy: p.aiMarketingCopy,
    };
  });

  const catCounts: Record<string, number> = {};
  all.filter(p => p.status === "Published").forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

  return NextResponse.json({
    products: customerProducts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    categoryCount: catCounts,
  });
}
