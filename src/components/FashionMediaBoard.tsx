"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, ImageIcon, Loader2, PlugZap, RefreshCw, Shirt, Smartphone, Sparkles, Store } from "lucide-react";

type MediaProduct = {
  id: string;
  title: string;
  imageUrl: string;
  price?: number;
  status?: string;
};

type Garment = {
  code: string;
  name: string;
  audience?: string;
  baseInr?: number;
};

type JsonObject = Record<string, unknown>;

const FALLBACK_GARMENTS: Garment[] = [
  { code: "US22", name: "Oversized Standard T-Shirt", audience: "unisex", baseInr: 225 },
  { code: "UC22", name: "Oversized Classic T-Shirt", audience: "unisex", baseInr: 265 },
  { code: "UT27", name: "Terry Oversized Tee", audience: "unisex", baseInr: 300 },
  { code: "UA22", name: "AOP Oversized T-Shirt", audience: "unisex", baseInr: 360 },
  { code: "FC32", name: "Crop Hoodie", audience: "women", baseInr: 345 },
  { code: "UJ31", name: "Varsity Jacket", audience: "unisex", baseInr: 775 },
];

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function imageFrom(item: JsonObject) {
  const images = Array.isArray(item.images) ? item.images : [];
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  const media = Array.isArray(item.media) ? item.media : [];
  const firstImage = images[0];
  const firstImageUrl = imageUrls[0];
  const firstMedia = media[0];
  return firstString(
    item.previewImageUrl,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item.thumbnailUrl,
    item.featuredImage,
    item.featured_image,
    item.image,
    typeof firstImageUrl === "string" ? firstImageUrl : asObject(firstImageUrl)?.url,
    typeof firstImage === "string" ? firstImage : asObject(firstImage)?.url,
    typeof firstMedia === "string" ? firstMedia : asObject(firstMedia)?.url,
  );
}

function arrayFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const obj = asObject(payload);
  if (!obj) return [];
  for (const key of ["products", "items", "data", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function garmentsFromPayload(payload: unknown): Garment[] {
  const obj = asObject(payload);
  if (!obj || !Array.isArray(obj.garments)) return [];
  return obj.garments.slice(0, 8).map((raw) => {
    const row = asObject(raw) || {};
    return {
      code: firstString(row.code) || "GARMENT",
      name: firstString(row.name) || "Fashion blank",
      audience: firstString(row.audience),
      baseInr: Number(row.baseInr || 0) || undefined,
    };
  });
}

function normalize(payloads: unknown[]) {
  const seen = new Set<string>();
  const out: MediaProduct[] = [];
  for (const payload of payloads) {
    for (const raw of arrayFromPayload(payload)) {
      const item = asObject(raw);
      if (!item) continue;
      const imageUrl = imageFrom(item);
      if (!imageUrl || !(/^(?:https?:\/\/|\/)/i.test(imageUrl))) continue;
      const id = String(item.id ?? item.sku ?? item.slug ?? imageUrl);
      if (seen.has(id)) continue;
      seen.add(id);
      const priceRaw = item.sellingPriceInr ?? item.price ?? item.salePrice ?? item.sale_price;
      const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw || 0) || undefined;
      out.push({
        id,
        title: firstString(item.title, item.name, item.productName, item.product_name) || "BharatShop product",
        imageUrl,
        price,
        status: firstString(item.status, item.state),
      });
    }
  }
  return out.slice(0, 12);
}

async function fetchJson(url: string, timeoutMs: number) {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

function GarmentVisual({ garment, index }: { garment: Garment; index: number }) {
  const palette = [
    ["#7c3aed", "#22d3ee"],
    ["#f97316", "#ec4899"],
    ["#10b981", "#06b6d4"],
    ["#eab308", "#f43f5e"],
    ["#8b5cf6", "#f472b6"],
    ["#14b8a6", "#84cc16"],
  ][index % 6];
  const isJacket = /jacket|varsity/i.test(garment.name);
  const isHoodie = /hood/i.test(garment.name);
  return <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#0b1018]">
    <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 35% 25%, ${palette[0]}55, transparent 38%), radial-gradient(circle at 75% 72%, ${palette[1]}44, transparent 34%)` }} />
    <svg viewBox="0 0 220 270" className="relative h-full w-full drop-shadow-[0_22px_32px_rgba(0,0,0,.55)]" aria-label={`${garment.name} concept preview`}>
      <defs>
        <linearGradient id={`g-${index}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#202938"/><stop offset="1" stopColor="#080b10"/></linearGradient>
      </defs>
      {isHoodie ? <path d="M76 58 Q110 22 144 58 L160 75 188 91 169 137 151 126 151 228 69 228 69 126 51 137 32 91 60 75Z" fill={`url(#g-${index})`} stroke="#94a3b8" strokeOpacity=".35"/> :
       isJacket ? <path d="M70 60 95 50 110 63 125 50 150 60 190 94 169 138 153 127 153 228 67 228 67 127 51 138 30 94Z" fill={`url(#g-${index})`} stroke="#94a3b8" strokeOpacity=".35"/> :
       <path d="M70 58 94 48 110 62 126 48 150 58 190 89 169 132 151 122 151 226 69 226 69 122 51 132 30 89Z" fill={`url(#g-${index})`} stroke="#94a3b8" strokeOpacity=".35"/>}
      <path d="M93 50 Q110 70 127 50" fill="none" stroke="#cbd5e1" strokeOpacity=".34" strokeWidth="3"/>
      <rect x="92" y="97" width="36" height="52" rx="8" fill={palette[0]} opacity=".85"/>
      <path d="M101 110 119 136 124 113 103 141" fill="none" stroke={palette[1]} strokeWidth="5" strokeLinecap="round"/>
      <circle cx="110" cy="165" r="15" fill="none" stroke={palette[1]} strokeWidth="4" opacity=".75"/>
    </svg>
    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/80">{garment.code}</div>
  </div>;
}

export default function FashionMediaBoard() {
  const [storePayload, setStorePayload] = useState<unknown>(null);
  const [studioPayload, setStudioPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const [store, studio] = await Promise.all([
      fetchJson("/api/storefront/products?sort=aiScore&limit=12&page=1", 8_000),
      fetchJson("/api/admin/fashion-studio", 8_000),
    ]);
    setStorePayload(store);
    setStudioPayload(studio);
    setLoading(false);
    if (!store && !studio) setNotice("Catalogue and local studio media endpoints did not respond. The fashion cockpit remains available; retry media after checking the local server.");
  }, []);

  useEffect(() => {
    let active = true;
    const watchdog = window.setTimeout(() => { if (active) setLoading(false); }, 9_000);
    void load().finally(() => window.clearTimeout(watchdog));
    return () => { active = false; window.clearTimeout(watchdog); };
  }, [load]);

  const media = useMemo(() => normalize([storePayload, studioPayload]), [storePayload, studioPayload]);
  const garments = useMemo(() => {
    const rows = garmentsFromPayload(studioPayload);
    return rows.length ? rows : FALLBACK_GARMENTS;
  }, [studioPayload]);
  const storeCount = useMemo(() => normalize([storePayload]).length, [storePayload]);
  const localCount = Math.max(0, media.length - storeCount);

  return <section className="mx-auto max-w-[1600px] px-4 pt-5 md:px-7 md:pt-7">
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(13,17,25,.98),rgba(23,15,30,.96))] shadow-[0_24px_80px_rgba(0,0,0,.32)]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between md:p-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300"><ImageIcon size={15}/> Visual production board</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Catalogue media + local design previews</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Published customer media comes from the authoritative storefront. Local Fashion Studio designs stay isolated on your laptop and render through BharatShop&apos;s own preview engine. Higgsfield and ChatGPT remain clearly marked external creative surfaces.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">{storeCount} published media</span>
            <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-violet-300">{localCount} local design media</span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">authoritative + isolated local</span>
          </div>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-white/[0.09]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Refresh media</button>
      </div>

      <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[1.5fr_.7fr]">
        <div>
          {media.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {media.map((product) => <a key={product.id} href="/store" className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-white/20 hover:bg-white/[0.03]">
              <div className="aspect-[4/5] overflow-hidden bg-[#141923]"><img src={product.imageUrl} alt={product.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"/></div>
              <div className="p-2.5"><div className="line-clamp-1 text-xs font-black text-white">{product.title}</div><div className="mt-1 flex items-center justify-between text-[10px] text-slate-500"><span>{product.status || "catalog"}</span>{product.price ? <span>₹{Math.round(product.price).toLocaleString("en-IN")}</span> : null}</div></div>
            </a>)}
          </div> : <div>
            <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-black text-white">Visual garment rack</div><div className="mt-1 text-xs text-slate-500">No publishable catalogue media is available yet, so the board shows clearly-labelled original garment concept previews instead of a blank panel.</div></div>{loading ? <Loader2 className="h-5 w-5 animate-spin text-violet-300"/> : null}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {garments.slice(0, 8).map((garment, index) => <div key={`${garment.code}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2">
                <GarmentVisual garment={garment} index={index}/>
                <div className="px-1 pb-1 pt-2"><div className="line-clamp-1 text-xs font-black text-white">{garment.name}</div><div className="mt-1 flex items-center justify-between text-[10px] text-slate-500"><span>{garment.audience || "fashion"}</span>{garment.baseInr ? <span>blank ₹{garment.baseInr}</span> : null}</div></div>
              </div>)}
            </div>
          </div>}
          {notice && <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{notice}</div>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <a href="/" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 hover:bg-emerald-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Smartphone className="h-5 w-5 text-emerald-300"/>BharatShop App</div><ExternalLink className="h-4 w-4 text-emerald-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Open the local PWA/storefront experience and verify the same catalogue state customers see.</p></a>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 hover:bg-cyan-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><PlugZap className="h-5 w-5 text-cyan-300"/>ChatGPT bridge</div><ExternalLink className="h-4 w-4 text-cyan-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Use ChatGPT as the external founder/operator surface for connected plugins, approvals and orchestration.</p></a>
          <a href="https://higgsfield.ai/mcp" target="_blank" rel="noreferrer" className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 hover:bg-violet-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Sparkles className="h-5 w-5 text-violet-300"/>Higgsfield connector</div><ExternalLink className="h-4 w-4 text-violet-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Connected through the external ChatGPT/plugin-MCP workflow for rendered UGC images and video. Generation remains credit-gated.</p></a>
          <a href="/store" className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-4 hover:bg-orange-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Store className="h-5 w-5 text-orange-300"/>Customer store</div><ExternalLink className="h-4 w-4 text-orange-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Open the customer-facing store to verify titles, media, pricing and published state.</p></a>
        </div>
      </div>
    </div>
  </section>;
}
