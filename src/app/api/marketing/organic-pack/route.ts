import { NextResponse } from "next/server";
import { GET as getStorefrontProducts } from "@/app/api/storefront/products/route";

export const dynamic = "force-dynamic";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

type Product = {
  id: number; sku: string; title: string; category: string; brand: string; imageUrl: string;
  sellingPriceInr: string; madeToOrder?: boolean; productionSupplier?: string;
};

const hash = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);

export async function GET() {
  const response = await getStorefrontProducts(new Request(`${SITE_URL}/api/storefront/products?limit=12&sort=aiScore`));
  if (!response.ok) return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
  const data = await response.json() as { products?: Product[] };
  const products = data.products || [];
  const posts = products.map(product => {
    const link = `${SITE_URL}/store/product/${product.id}`;
    const price = `₹${Number(product.sellingPriceInr).toLocaleString("en-IN")}`;
    const production = product.madeToOrder ? ` Made to order by ${product.productionSupplier || "Qikink"}.` : " Available now on BharatShop.";
    const hashtags = ["#BharatShop", `#${hash(product.category)}`, product.madeToOrder ? "#BharatShopStudio" : "#SmartShopping", "#ShopIndia"];
    return {
      productId: product.id,
      sku: product.sku,
      image: product.imageUrl,
      link,
      facebook: `${product.title} — ${price}.${production}\n\nShop: ${link}\n\n${hashtags.join(" ")}`,
      instagram: `${product.title} ✨\n${price}.${production}\n\nTap the link to shop.\n\n${hashtags.concat(product.madeToOrder ? ["#PrintOnDemandIndia", "#MadeToOrder"] : []).join(" ")}`,
      googleBusinessProfile: `${product.title} now on BharatShop for ${price}. ${product.madeToOrder ? "Original made-to-order fashion." : "Verified storefront listing."} ${link}`,
    };
  });

  return NextResponse.json({
    mode: "ORGANIC_ZERO_BUDGET",
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts,
    feeds: {
      googleMerchant: `${SITE_URL}/api/feeds/google-merchant`,
      metaCatalog: `${SITE_URL}/api/feeds/meta-catalog`,
    },
    note: "These assets require no paid AI API. Automatic publishing to third-party social accounts still requires the account owner's official platform access token/permissions.",
  });
}
