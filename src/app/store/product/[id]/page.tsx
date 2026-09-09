import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GET as getStorefrontProducts } from "@/app/api/storefront/products/route";

export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

type Product = {
  id: number;
  sku: string;
  title: string;
  category: string;
  brand: string;
  imageUrl: string;
  imageUrls?: string[];
  sellingPriceInr: string;
  mrpInr: string;
  stockCount: number;
  madeToOrder?: boolean;
  productionSupplier?: string;
  sizeOptions?: string[];
  aiMarketingCopy?: string;
  details?: { description?: string; material?: string; colorOptions?: string } | null;
};

type Props = { params: Promise<{ id: string }> };

const money = (value: string | number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const cleanCopy = (value?: string) => String(value || "").replace(/(?:profit|margin|supplier|source|wholesale|dropship|commission)[^.!?]*[.!?]?/gi, "").replace(/\s{2,}/g, " ").trim();

async function loadProduct(id: string): Promise<Product | null> {
  const numericId = Math.max(parseInt(id, 10) || 0, 0);
  if (!numericId) return null;
  const response = await getStorefrontProducts(new Request(`${SITE_URL}/api/storefront/products?id=${numericId}&limit=1`));
  if (!response.ok) return null;
  const data = await response.json() as { products?: Product[] };
  return data.products?.[0] || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) return { title: "Product not found" };
  const description = cleanCopy(product.details?.description || product.aiMarketingCopy) || `Shop ${product.title} on BharatShop.`;
  const canonical = `/store/product/${product.id}`;
  return {
    title: product.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: `${SITE_URL}${canonical}`,
      title: product.title,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl, alt: product.title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: product.imageUrl ? [product.imageUrl] : [],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) notFound();

  const images = Array.from(new Set([...(product.imageUrls || []), product.imageUrl].filter(Boolean))).slice(0, 8);
  const description = cleanCopy(product.details?.description || product.aiMarketingCopy) || "Carefully selected for quality, value and everyday usefulness.";
  const available = product.madeToOrder || product.stockCount > 0;
  const url = `${SITE_URL}/store/product/${product.id}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category,
    description,
    image: images,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: Number(product.sellingPriceInr).toFixed(2),
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-10">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link href="/store" className="font-black text-slate-900">← BharatShop</Link>
          <span className="text-xs font-bold text-slate-500">Secure storefront</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-10 bg-white rounded-3xl border border-slate-100 p-4 sm:p-8 shadow-sm">
          <section className="min-w-0">
            <div className="w-full aspect-[4/3] sm:aspect-square max-h-[65vh] rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden">
              {images[0] ? <img src={images[0]} alt={product.title} className="w-full h-full object-contain p-2 sm:p-5" /> : null}
            </div>
            {images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto py-3">
                {images.slice(1).map((src, index) => <div key={`${src}-${index}`} className="flex-none w-16 h-16 sm:w-20 sm:h-20 rounded-xl border bg-white overflow-hidden"><img src={src} alt={`${product.title} view ${index + 2}`} className="w-full h-full object-contain" /></div>)}
              </div>
            ) : null}
          </section>

          <section>
            <p className="text-xs font-black text-orange-600 uppercase tracking-widest">{product.brand}</p>
            <h1 className="text-3xl sm:text-5xl font-black leading-tight mt-2">{product.title}</h1>
            <p className="text-slate-600 leading-7 mt-5">{description}</p>
            <div className="flex flex-wrap items-baseline gap-3 mt-6">
              <b className="text-4xl">{money(product.sellingPriceInr)}</b>
              {Number(product.mrpInr) > Number(product.sellingPriceInr) ? <span className="text-slate-400 line-through">{money(product.mrpInr)}</span> : null}
            </div>

            <div className={`mt-6 rounded-2xl p-4 border ${product.madeToOrder ? "bg-violet-50 border-violet-100 text-violet-800" : "bg-green-50 border-green-100 text-green-800"}`}>
              <b>{product.madeToOrder ? `Made to order by ${product.productionSupplier || "Qikink"}` : available ? "In stock" : "Currently unavailable"}</b>
              <p className="text-sm mt-1">{product.madeToOrder ? "Produced after you order; this is not presented as warehouse stock." : "Supplier-backed availability is checked before publication."}</p>
            </div>

            {product.sizeOptions?.length ? <p className="mt-5 text-sm"><b>Sizes:</b> {product.sizeOptions.join(", ")}</p> : null}
            {product.details?.material ? <p className="mt-2 text-sm"><b>Material:</b> {product.details.material}</p> : null}
            {product.details?.colorOptions ? <p className="mt-2 text-sm"><b>Colours:</b> {product.details.colorOptions}</p> : null}

            <Link href="/store" className="mt-8 inline-flex w-full sm:w-auto items-center justify-center h-12 px-7 rounded-xl bg-orange-500 text-white font-black shadow-lg">Shop this product</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
