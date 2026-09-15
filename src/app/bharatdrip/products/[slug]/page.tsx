import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/bharatdrip/product-detail";
import { getProduct, products } from "@/lib/bharatdrip/products";

type ProductPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return product ? { title: `${product.name} — bharatdrip`, description: product.description } : { title: "Piece not found — bharatdrip" };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
