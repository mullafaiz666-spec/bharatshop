import type { MetadataRoute } from "next";
import { GET as getStorefrontProducts } from "@/app/api/storefront/products/route";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

type Product = { id: number };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/store`, lastModified: now, changeFrequency: "hourly", priority: 0.95 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const response = await getStorefrontProducts(new Request(`${SITE_URL}/api/storefront/products?limit=192&sort=newest`));
    if (!response.ok) return base;
    const data = await response.json() as { products?: Product[] };
    return base.concat((data.products || []).map(product => ({
      url: `${SITE_URL}/store/product/${product.id}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })));
  } catch {
    return base;
  }
}
