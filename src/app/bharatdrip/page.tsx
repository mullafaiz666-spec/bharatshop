import { Storefront } from "@/components/bharatdrip/storefront";
import { getLiveBharatDripProducts } from "@/lib/bharatdrip/live-products";
import { products as staticProducts } from "@/lib/bharatdrip/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  let liveProducts = [];
  try {
    liveProducts = await getLiveBharatDripProducts();
  } catch {
    // Keep the dedicated brand storefront usable even if the database is temporarily unavailable.
  }
  const liveIds = new Set(liveProducts.map((product) => product.id));
  const catalogue = [...liveProducts, ...staticProducts.filter((product) => !liveIds.has(product.id))];
  return <Storefront initialProducts={catalogue} />;
}
