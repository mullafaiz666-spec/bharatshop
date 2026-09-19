import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/bharatdrip/product-detail";
import { getLiveBharatDripProduct } from "@/lib/bharatdrip/live-products";
import { getProduct } from "@/lib/bharatdrip/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductPageProps = { params: Promise<{ slug: string }> };

async function resolveProduct(slug: string) {
  if (slug.startsWith("live-")) {
    try {
      const live = await getLiveBharatDripProduct(slug);
      if (live) return live;
    } catch {
      // Static catalogue fallback remains available below.
    }
  }
  return getProduct(slug);
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await resolveProduct(slug);
  return product ? { title: `${product.name} — bharatdrip`, description: product.description } : { title: "Piece not found — bharatdrip" };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await resolveProduct(slug);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
