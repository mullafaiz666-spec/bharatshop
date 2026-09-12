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

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function imageFrom(item: JsonObject) {
  const images = Array.isArray(item.images) ? item.images : [];
  const media = Array.isArray(item.media) ? item.media : [];
  const firstImage = images[0];
  const firstMedia = media[0];
  return firstString(
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item.thumbnailUrl,
    item.featuredImage,
    item.featured_image,
    item.image,
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
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

export default function FashionMediaBoard() {
  const [fashionPayload, setFashionPayload] = useState<unknown>(null);
  const [storePayload, setStorePayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");

    // Customer-safe storefront media is the fastest, authoritative preview source.
    // Render it first instead of holding the whole visual board behind slower admin data.
    const store = await fetchJson("/api/storefront/products?sort=aiScore&limit=12&page=1", 10_000);
    setStorePayload(store);
    setLoading(false);

    // Enrich with local Fashion Agent records when available. Failure here must never
    // hide already-valid storefront media or leave the dashboard spinning indefinitely.
    const fashion = await fetchJson("/api/admin/fashion-agent", 10_000);
    setFashionPayload(fashion);

    if (!store && !fashion) setNotice("Catalogue media endpoints did not respond. The rest of the fashion cockpit remains usable; retry media when the services recover.");
  }, []);

  useEffect(() => { void load(); }, [load]);
  const media = useMemo(() => normalize([storePayload, fashionPayload]), [storePayload, fashionPayload]);

  return <section className="mx-auto max-w-[1600px] px-4 pt-5 md:px-7 md:pt-7">
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(13,17,25,.98),rgba(23,15,30,.96))] shadow-[0_24px_80px_rgba(0,0,0,.32)]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-end lg:justify-between md:p-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300"><ImageIcon size={15}/> Visual production board</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">Real catalogue media + creative bridges</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Customer-safe media is previewed from the authoritative BharatShop storefront while your laptop database stays isolated for local agent testing. Higgsfield and ChatGPT remain clearly marked as external creative surfaces.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">{media.length} verified media cards</span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">authoritative preview</span>
          </div>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-white/[0.09]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Refresh media</button>
      </div>

      <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[1.5fr_.7fr]">
        <div>
          {loading && !media.length ? <div className="grid min-h-56 place-items-center rounded-2xl border border-white/10 bg-black/20"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-300"/><div className="mt-3 text-xs font-bold text-slate-400">Loading authoritative catalogue media…</div></div></div> : media.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {media.map((product) => <a key={product.id} href="/store" className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-white/20 hover:bg-white/[0.03]">
              <div className="aspect-[4/5] overflow-hidden bg-[#141923]"><img src={product.imageUrl} alt={product.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"/></div>
              <div className="p-2.5"><div className="line-clamp-1 text-xs font-black text-white">{product.title}</div><div className="mt-1 flex items-center justify-between text-[10px] text-slate-500"><span>{product.status || "catalog"}</span>{product.price ? <span>₹{Math.round(product.price).toLocaleString("en-IN")}</span> : null}</div></div>
            </a>)}
          </div> : <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center"><div><Shirt className="mx-auto h-9 w-9 text-slate-600"/><div className="mt-3 text-sm font-black text-white">No verified catalogue image returned</div><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">The board is no longer stuck. If this remains empty, the authoritative storefront currently has no publishable verified-media records for this query.</p></div></div>}
          {notice && <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{notice}</div>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <a href="/" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 hover:bg-emerald-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Smartphone className="h-5 w-5 text-emerald-300"/>BharatShop App</div><ExternalLink className="h-4 w-4 text-emerald-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Open the local PWA/storefront experience and verify the same catalogue media customers see.</p></a>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 hover:bg-cyan-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><PlugZap className="h-5 w-5 text-cyan-300"/>ChatGPT bridge</div><ExternalLink className="h-4 w-4 text-cyan-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Use ChatGPT as the external operator surface for connected plugins and founder approvals.</p></a>
          <a href="https://higgsfield.ai/mcp" target="_blank" rel="noreferrer" className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 hover:bg-violet-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Sparkles className="h-5 w-5 text-violet-300"/>Higgsfield connector</div><ExternalLink className="h-4 w-4 text-violet-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Official ChatGPT plugin/MCP surface for rendered UGC images and video. Generation remains credit-gated.</p></a>
          <a href="/store" className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-4 hover:bg-orange-400/[0.09]"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black text-white"><Store className="h-5 w-5 text-orange-300"/>Customer store</div><ExternalLink className="h-4 w-4 text-orange-300"/></div><p className="mt-2 text-xs leading-5 text-slate-400">Open the customer-facing store to verify titles, media, pricing and published state.</p></a>
        </div>
      </div>
    </div>
  </section>;
}
