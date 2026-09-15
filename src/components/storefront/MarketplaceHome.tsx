"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgePercent, Search, ShieldCheck, ShoppingBag, Sparkles, Truck } from "lucide-react";

type Product = {
  id: number;
  title: string;
  category: string;
  brand: string;
  imageUrl: string;
  sellingPriceInr: string;
  mrpInr: string;
};

type Department = "women" | "men" | "kids" | "electronics";

const departments: { key: Department; href: string; label: string; copy: string; background: string }[] = [
  { key: "women", href: "/women", label: "Women", copy: "Modern silhouettes, everyday edits and standout fashion.", background: "linear-gradient(135deg,#f4dfe5,#f8eeea)" },
  { key: "men", href: "/men", label: "Men", copy: "Sharp staples, casual layers and a cleaner daily rotation.", background: "linear-gradient(135deg,#dce3e0,#eef1ef)" },
  { key: "kids", href: "/kids", label: "Kids", copy: "Colourful, comfortable picks for every little adventure.", background: "linear-gradient(135deg,#ffe9a8,#f5f1d7)" },
  { key: "electronics", href: "/electronics", label: "Electronics", copy: "Useful tech, mobile add-ons and smarter everyday gear.", background: "linear-gradient(135deg,#dce5ff,#edf3fb)" },
];

const money = (value: string | number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const textOf = (p: Product) => `${p.title} ${p.category}`.toLowerCase();
const matches = (p: Product, key: Department) => {
  const text = textOf(p);
  if (key === "women") return /women|woman|ladies|female/.test(text);
  if (key === "men") return !/women|woman|ladies|female/.test(text) && /(^|\W)(men|mens|male)(\W|$)/.test(text);
  if (key === "kids") return /kid|kids|child|children|boy|girl/.test(text);
  return /elect|gadget|mobile|phone|audio|earbud|charger|cable|smart|power bank/.test(text);
};

function ProductCard({ product }: { product: Product }) {
  const mrp = Number(product.mrpInr || 0);
  const price = Number(product.sellingPriceInr || 0);
  return (
    <Link href={`/store/product/${product.id}`} className="group block min-w-0">
      <div className="aspect-[4/5] overflow-hidden rounded-[24px] border border-black/5 bg-white">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-contain p-4 transition duration-500 group-hover:scale-[1.04]" /> : <div className="h-full w-full bg-slate-100" />}
      </div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">{product.brand || "BharatShop"}</p>
      <h3 className="mt-1 min-h-10 text-sm font-bold leading-5 line-clamp-2">{product.title}</h3>
      <div className="mt-2 flex items-baseline gap-2"><span className="font-black">{money(product.sellingPriceInr)}</span>{mrp > price && <span className="text-xs text-slate-400 line-through">{money(product.mrpInr)}</span>}</div>
    </Link>
  );
}

export default function MarketplaceHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/storefront/products?sort=aiScore&limit=48&page=1")
      .then((response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json();
      })
      .then((data) => active && setProducts(Array.isArray(data.products) ? data.products : []))
      .catch(() => active && setProducts([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const heroProducts = useMemo(() => products.slice(0, 3), [products]);
  const newNow = useMemo(() => products.slice(0, 8), [products]);

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#171717]">
      <div className="bg-black px-4 py-2 text-center text-[11px] font-bold tracking-wide text-white sm:text-xs">BharatShop • One marketplace for fashion, family and everyday essentials</div>

      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="text-xl font-black tracking-[-0.05em] sm:text-2xl">BHARATSHOP</Link>
          <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
            {departments.map((item) => <Link key={item.href} href={item.href} className="text-sm font-bold text-slate-600 hover:text-black">{item.label}</Link>)}
            <Link href="/bharatdrip" className="text-sm font-black text-slate-900 hover:text-black">BharatDrip</Link>
            <Link href="/store" className="text-sm font-bold text-slate-600 hover:text-black">All products</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/store" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white"><Search size={18} /></Link>
            <Link href="/store" aria-label="Shopping bag" className="grid h-10 w-10 place-items-center rounded-full bg-black text-white"><ShoppingBag size={18} /></Link>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-black/5 lg:hidden"><div className="flex min-w-max gap-2 px-4 py-2.5">{departments.map((item) => <Link key={item.href} href={item.href} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">{item.label}</Link>)}<Link href="/bharatdrip" className="rounded-full bg-[#d8fc58] px-4 py-2 text-xs font-black text-black">BharatDrip</Link><Link href="/store" className="rounded-full bg-black px-4 py-2 text-xs font-black text-white">All products</Link></div></div>
      </header>

      <section className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-8 sm:pt-8">
        <div className="relative overflow-hidden rounded-[32px] bg-[#ead8c8] px-6 py-10 sm:px-10 lg:min-h-[590px] lg:px-14 lg:py-16">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.18em]"><Sparkles size={15} /> BharatShop new storefront</div>
            <h1 className="mt-5 text-5xl font-black leading-[0.9] tracking-[-0.06em] sm:text-6xl lg:text-[82px]">Everything you want.<br />One BharatShop.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-black/65 sm:text-lg">A cleaner marketplace experience built around departments, curated edits and the same real BharatShop catalogue underneath.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/store" className="inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-black text-white">Shop all products <ArrowRight size={17} /></Link>
              <Link href="/women" className="inline-flex h-12 items-center rounded-full border border-black/20 bg-white/70 px-6 text-sm font-black">Explore fashion</Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 lg:absolute lg:bottom-8 lg:right-8 lg:top-8 lg:mt-0 lg:w-[45%] lg:grid-cols-2 lg:grid-rows-2">
            {(heroProducts.length ? heroProducts : [null, null, null]).map((product, index) => (
              <div key={product?.id ?? index} className={`overflow-hidden rounded-[26px] bg-white/80 shadow-sm ${index === 0 ? "col-span-2 lg:col-span-1 lg:row-span-2" : ""}`}>
                {product?.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full min-h-44 w-full object-contain p-4 sm:min-h-56" /> : <div className="min-h-44 sm:min-h-56" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Shop by department</p><h2 className="mt-1 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Made for the whole cart.</h2></div><Link href="/store" className="hidden items-center gap-2 text-sm font-black sm:flex">View all <ArrowRight size={16} /></Link></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {departments.map((department) => {
            const image = products.find((product) => matches(product, department.key))?.imageUrl;
            return (
              <Link key={department.key} href={department.href} className="group relative min-h-[360px] overflow-hidden rounded-[28px] p-6" style={{ background: department.background }}>
                <div className="relative z-10"><p className="text-2xl font-black tracking-[-0.04em]">{department.label}</p><p className="mt-2 max-w-[240px] text-sm leading-6 text-black/60">{department.copy}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-black">Shop now <ArrowRight size={15} /></span></div>
                {image && <img src={image} alt="" className="absolute bottom-0 right-0 h-[58%] w-[78%] object-contain p-3 transition duration-500 group-hover:scale-105" />}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[24px] bg-[#f5f5f3] p-6"><Truck size={22} /><h3 className="mt-10 font-black">Doorstep delivery</h3><p className="mt-1 text-xs leading-5 text-slate-500">Designed around a simple purchase journey.</p></div>
            <div className="rounded-[24px] bg-[#f5f5f3] p-6"><ShieldCheck size={22} /><h3 className="mt-10 font-black">Secure ordering</h3><p className="mt-1 text-xs leading-5 text-slate-500">Existing BharatShop checkout and payment safeguards remain intact.</p></div>
            <div className="rounded-[24px] bg-[#f5f5f3] p-6"><BadgePercent size={22} /><h3 className="mt-10 font-black">Clear pricing</h3><p className="mt-1 text-xs leading-5 text-slate-500">See sale pricing and MRP without internal sourcing details.</p></div>
            <div className="rounded-[24px] bg-black p-6 text-white"><Sparkles size={22} /><h3 className="mt-10 font-black">BharatShop Studio</h3><p className="mt-1 text-xs leading-5 text-white/60">Original made-to-order fashion sits beside verified marketplace finds.</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">New & now</p><h2 className="mt-1 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Fresh from the catalogue.</h2></div><Link href="/store" className="hidden items-center gap-2 text-sm font-black sm:flex">Shop all <ArrowRight size={16} /></Link></div>
        {loading ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-[24px] bg-white" />)}</div> : newNow.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{newNow.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[28px] bg-white p-10 text-center"><h3 className="text-xl font-black">Catalogue is temporarily unavailable.</h3><p className="mt-2 text-sm text-slate-500">The storefront structure is ready; live products will appear here when the catalogue API responds.</p><Link href="/store" className="mt-5 inline-flex rounded-full bg-black px-6 py-3 text-sm font-black text-white">Open store</Link></div>}
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8">
        <div className="grid overflow-hidden rounded-[32px] bg-[#1c1c1c] text-white lg:grid-cols-2">
          <div className="p-8 sm:p-12"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">BharatShop Studio</p><h2 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Original fashion, connected to the real store.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-white/65">The design-led front end now sits on top of your existing catalogue, product-detail and checkout architecture instead of replacing it with a mock demo.</p><Link href="/women" className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black">See the fashion edit <ArrowRight size={16} /></Link></div>
          <div className="grid min-h-[320px] grid-cols-2 gap-2 bg-white/5 p-4">{heroProducts.slice(0,2).map((product) => <div key={product.id} className="overflow-hidden rounded-[24px] bg-white"><img src={product.imageUrl} alt={product.title} className="h-full w-full object-contain p-4" /></div>)}</div>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-8 md:grid-cols-3">
          <div><p className="text-xl font-black tracking-[-0.05em]">BHARATSHOP</p><p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">India-first marketplace experience with distinct shopping departments and one connected operational backend.</p></div>
          <div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Departments</p><div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">{departments.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div></div>
          <div className="md:text-right"><Link href="/store" className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white">Enter store <ArrowRight size={16} /></Link></div>
        </div>
      </footer>
    </main>
  );
}
