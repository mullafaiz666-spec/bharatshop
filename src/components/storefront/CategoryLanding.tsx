"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Heart, Search, ShoppingBag, Sparkles, Truck } from "lucide-react";

type Department = "women" | "men" | "kids" | "electronics";
type Product = {
  id: number;
  title: string;
  category: string;
  brand: string;
  imageUrl: string;
  sellingPriceInr: string;
  mrpInr: string;
  madeToOrder?: boolean;
};

type Config = {
  eyebrow: string;
  title: string;
  subtitle: string;
  search: string;
  promo: string;
  heroBg: string;
  softBg: string;
  accent: string;
  chips: string[];
};

const CONFIG: Record<Department, Config> = {
  women: {
    eyebrow: "BharatShop Women",
    title: "Style that moves with you.",
    subtitle: "Fresh silhouettes, everyday essentials and statement pieces curated for modern Indian wardrobes.",
    search: "women",
    promo: "THE WOMEN'S EDIT",
    heroBg: "linear-gradient(135deg,#f9e7ea 0%,#f5d9df 48%,#efe8e4 100%)",
    softBg: "#fff7f8",
    accent: "#a73552",
    chips: ["New season", "Ethnic edit", "Workwear", "Casual", "Accessories"],
  },
  men: {
    eyebrow: "BharatShop Men",
    title: "Built for your everyday rotation.",
    subtitle: "Clean staples, street-led layers and sharp occasion picks with an easy premium feel.",
    search: "men",
    promo: "THE MEN'S EDIT",
    heroBg: "linear-gradient(135deg,#e8eceb 0%,#d8e0de 48%,#edf0ec 100%)",
    softBg: "#f6f8f7",
    accent: "#24463f",
    chips: ["New arrivals", "Streetwear", "Smart casual", "Basics", "Accessories"],
  },
  kids: {
    eyebrow: "BharatShop Kids",
    title: "Big style for little personalities.",
    subtitle: "Play-ready favourites, cheerful colours and easy outfits made for everyday adventures.",
    search: "kid",
    promo: "THE KIDS' EDIT",
    heroBg: "linear-gradient(135deg,#fff0bf 0%,#ffe2a9 47%,#e8f1dc 100%)",
    softBg: "#fffaf0",
    accent: "#9a5a00",
    chips: ["Girls", "Boys", "Playwear", "Festive", "Accessories"],
  },
  electronics: {
    eyebrow: "BharatShop Electronics",
    title: "Smarter gear. Cleaner setup.",
    subtitle: "Useful everyday tech, mobile accessories and practical gadgets selected for value and convenience.",
    search: "elect",
    promo: "THE TECH EDIT",
    heroBg: "linear-gradient(135deg,#e7ecff 0%,#d7e1fb 50%,#e4eef4 100%)",
    softBg: "#f6f8ff",
    accent: "#334ea0",
    chips: ["Mobile", "Audio", "Smart gadgets", "Accessories", "Everyday tech"],
  },
};

const NAV: { href: string; label: string; key?: Department }[] = [
  { href: "/", label: "Home" },
  { href: "/women", label: "Women", key: "women" },
  { href: "/men", label: "Men", key: "men" },
  { href: "/kids", label: "Kids", key: "kids" },
  { href: "/electronics", label: "Electronics", key: "electronics" },
  { href: "/store", label: "All products" },
];

const money = (value: string | number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const textOf = (p: Product) => `${p.title} ${p.category}`.toLowerCase();
const matchesDepartment = (p: Product, department: Department) => {
  const text = textOf(p);
  if (department === "women") return /women|woman|ladies|female/.test(text);
  if (department === "men") return !/women|woman|ladies|female/.test(text) && /(^|\W)(men|mens|male)(\W|$)/.test(text);
  if (department === "kids") return /kid|kids|child|children|boy|girl/.test(text);
  return /elect|gadget|mobile|phone|audio|earbud|charger|cable|smart|power bank/.test(text);
};

function ProductCard({ product }: { product: Product }) {
  const mrp = Number(product.mrpInr || 0);
  const price = Number(product.sellingPriceInr || 0);
  const off = mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return (
    <Link href={`/store/product/${product.id}`} className="group block min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-white border border-black/5">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} className="h-full w-full object-contain p-4 transition duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="h-full w-full bg-slate-100" />
        )}
        <button type="button" aria-label="Save product" onClick={(e) => e.preventDefault()} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-sm">
          <Heart size={16} />
        </button>
        {off > 0 && <span className="absolute left-3 top-3 rounded-full bg-black px-2.5 py-1 text-[10px] font-black text-white">{off}% OFF</span>}
      </div>
      <div className="pt-3">
        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">{product.brand || "BharatShop"}</p>
        <h3 className="mt-1 min-h-10 text-sm font-bold leading-5 text-slate-900 line-clamp-2">{product.title}</h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-black text-slate-950">{money(product.sellingPriceInr)}</span>
          {mrp > price && <span className="text-xs text-slate-400 line-through">{money(product.mrpInr)}</span>}
        </div>
      </div>
    </Link>
  );
}

export default function CategoryLanding({ department }: { department: Department }) {
  const config = CONFIG[department];
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/storefront/products?search=${encodeURIComponent(config.search)}&sort=aiScore&limit=48&page=1`)
      .then((response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.products) ? data.products : [];
        setProducts(rows.filter((product: Product) => matchesDepartment(product, department)));
      })
      .catch(() => active && setProducts([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [config.search, department]);

  const hero = products[0];
  const visualProducts = useMemo(() => products.slice(0, 4), [products]);
  const trending = useMemo(() => products.slice(0, 12), [products]);

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#171717]">
      <div className="bg-black px-4 py-2 text-center text-[11px] font-bold tracking-wide text-white sm:text-xs">
        Discover new BharatShop edits • Secure ordering • Customer-first catalogue
      </div>

      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="text-xl font-black tracking-[-0.05em] sm:text-2xl">BHARATSHOP</Link>
          <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={`text-sm font-bold ${item.key === department ? "text-black" : "text-slate-500 hover:text-black"}`}>
                {item.label}
                {item.key === department && <span className="mx-auto mt-1 block h-0.5 w-7 bg-black" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/store" aria-label="Search BharatShop" className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white"><Search size={18} /></Link>
            <Link href="/store" aria-label="Shopping bag" className="grid h-10 w-10 place-items-center rounded-full bg-black text-white"><ShoppingBag size={18} /></Link>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-black/5 lg:hidden">
          <div className="flex min-w-max gap-2 px-4 py-2.5">
            {NAV.slice(1).map((item) => <Link key={item.href} href={item.href} className={`rounded-full px-4 py-2 text-xs font-black ${item.key === department ? "bg-black text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</Link>)}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-8 sm:pt-8">
        <div className="relative overflow-hidden rounded-[30px] px-6 py-10 sm:px-10 lg:min-h-[560px] lg:px-14 lg:py-16" style={{ background: config.heroBg }}>
          <div className="relative z-10 max-w-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: config.accent }}>{config.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">{config.title}</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-black/65 sm:text-lg">{config.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#trending" className="inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-black text-white">Shop the edit <ArrowRight size={17} /></a>
              <Link href="/store" className="inline-flex h-12 items-center rounded-full border border-black/20 bg-white/70 px-6 text-sm font-black">Explore all products</Link>
            </div>
          </div>

          <div className="mt-9 grid grid-cols-2 gap-3 lg:absolute lg:bottom-8 lg:right-8 lg:top-8 lg:mt-0 lg:w-[48%] lg:grid-cols-2 lg:grid-rows-2">
            {(visualProducts.length ? visualProducts : [null, null, null, null]).map((product, index) => (
              <div key={product?.id ?? index} className={`overflow-hidden rounded-[24px] bg-white/75 backdrop-blur ${index === 0 ? "lg:row-span-2" : ""}`}>
                {product?.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full min-h-44 w-full object-contain p-4 sm:min-h-56" /> : <div className="min-h-44 sm:min-h-56" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {config.chips.map((chip) => <span key={chip} className="whitespace-nowrap rounded-full border border-black/10 bg-white px-5 py-3 text-xs font-black">{chip}</span>)}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-10 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-[28px] p-7 sm:p-10" style={{ background: config.softBg }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: config.accent }}>{config.promo}</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Curated for now.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">A cleaner, more editorial way to browse BharatShop without losing the real catalogue, pricing and product-detail flow underneath.</p>
              </div>
              <Sparkles className="hidden sm:block" style={{ color: config.accent }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[28px] bg-white p-6"><Truck className="mb-8" size={22} /><p className="text-sm font-black">Doorstep delivery</p><p className="mt-1 text-xs leading-5 text-slate-500">Clear ordering and fulfilment information.</p></div>
            <div className="rounded-[28px] bg-black p-6 text-white"><ShoppingBag className="mb-8" size={22} /><p className="text-sm font-black">Secure checkout</p><p className="mt-1 text-xs leading-5 text-white/65">Continue into BharatShop’s existing order flow.</p></div>
          </div>
        </div>
      </section>

      <section id="trending" className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Trending now</p><h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">Shop {department}</h2></div>
          <Link href="/store" className="hidden items-center gap-2 text-sm font-black sm:flex">View full catalogue <ArrowRight size={16} /></Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-[24px] bg-white" />)}</div>
        ) : trending.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">{trending.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        ) : (
          <div className="rounded-[28px] border border-black/10 bg-white p-10 text-center"><h3 className="text-xl font-black">This edit is being prepared.</h3><p className="mt-2 text-sm text-slate-500">Browse the full live catalogue while products for this department are published.</p><Link href="/store" className="mt-5 inline-flex rounded-full bg-black px-6 py-3 text-sm font-black text-white">Open catalogue</Link></div>
        )}
      </section>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-8 md:grid-cols-3">
          <div><p className="text-xl font-black tracking-[-0.05em]">BHARATSHOP</p><p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">One marketplace, multiple departments, one consistent BharatShop experience.</p></div>
          <div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Departments</p><div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">{NAV.slice(1,5).map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div></div>
          <div className="md:text-right"><Link href="/store" className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white">Shop BharatShop <ArrowRight size={16} /></Link></div>
        </div>
      </footer>
    </main>
  );
}
