import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";

export async function GET(req: Request) {
  await ensureDemoDataSeeded();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "aiScore";
  const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 96);
  const page = parseInt(searchParams.get("page") || "1");
  const featured = searchParams.get("featured") === "true";

  const all = await db.select().from(products).orderBy(desc(products.aiScore));

  let filtered = all.filter(p => p.status === "Published");
  if (featured) filtered = filtered.filter(p => p.aiScore >= 92);
  if (category && category !== "ALL") filtered = filtered.filter(p => p.category === category);
  if (search) {
    const q = search.toLowerCase();
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

  // Category counts
  const catCounts: Record<string, number> = {};
  all.filter(p => p.status === "Published").forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

  return NextResponse.json({
    products: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    categoryCount: catCounts,
  });
}
