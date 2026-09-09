"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Images,
  Layers3,
  Loader2,
  Minus,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const panel = "rounded-2xl border border-slate-800 bg-slate-900/80 shadow-[0_12px_45px_rgba(0,0,0,.22)]";
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-orange-400";
const label = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500";

type Garment = { code: string; name: string; audience: string; sizes: string[]; baseInr: number };
type Product = {
  id: number;
  sku: string;
  title: string;
  category: string;
  brand: string;
  status: string;
  sellingPriceInr: number;
  netProfitInr: number;
  marginPct: number;
  updatedAt: string;
  specifications: any;
};
type StudioData = {
  garments: Garment[];
  printMethods: string[];
  products: Product[];
  priceBands: Record<string, { min: number; max: number }>;
  policy: string;
};
type Placement = { x: number; y: number; scale: number; rotate: number };
type StudioTab = "inspiration" | "uploads" | "text" | "layers";

const inspirations = [
  { name: "Dark Manga", note: "High-contrast panel energy", motif: "月", accent: "#f97316" },
  { name: "Neo Tokyo", note: "Chrome + cyber street", motif: "零", accent: "#22d3ee" },
  { name: "Oni Signal", note: "Mask geometry, red/black", motif: "鬼", accent: "#fb7185" },
  { name: "Vintage Wash", note: "Distressed tonal graphic", motif: "96", accent: "#a3e635" },
  { name: "Samurai Line", note: "Minimal crest composition", motif: "侍", accent: "#c084fc" },
  { name: "Racing Club", note: "Fast type + badge system", motif: "R", accent: "#facc15" },
];

const printEstimate: Record<string, number> = {
  "Pocket DTF": 55,
  "Front DTF": 95,
  "Front + Back DTF": 185,
  AOP: 245,
  Embroidery: 175,
};

function GarmentCanvas({
  garment,
  garmentColor,
  palette,
  title,
  artPreview,
  placement,
  side,
  zoom,
}: {
  garment: string;
  garmentColor: string;
  palette: string[];
  title: string;
  artPreview: string;
  placement: Placement;
  side: "front" | "back";
  zoom: number;
}) {
  const hoodie = garment.toLowerCase().includes("hood");
  const crop = garment.toLowerCase().includes("crop");
  const [accent, second] = [palette[1] || "#f97316", palette[2] || "#f8fafc"];
  const transform = `translate(${placement.x}px, ${placement.y}px) rotate(${placement.rotate}deg) scale(${placement.scale / 100})`;

  return (
    <div className="relative flex min-h-[560px] items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#111722] md:min-h-[690px]">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#263142 1px,transparent 1px),linear-gradient(90deg,#263142 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="absolute left-4 top-4 z-20 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {side} print area · {Math.round(zoom * 100)}%
      </div>
      <div className="relative origin-center transition-transform duration-200" style={{ transform: `scale(${zoom})` }}>
        <div className="relative h-[510px] w-[420px] max-w-[82vw]">
          <svg viewBox="0 0 420 510" className="absolute inset-0 h-full w-full drop-shadow-[0_28px_24px_rgba(0,0,0,.5)]">
            <defs>
              <linearGradient id="cloth" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={garmentColor} />
                <stop offset=".48" stopColor={garmentColor} />
                <stop offset="1" stopColor="#111827" stopOpacity=".92" />
              </linearGradient>
            </defs>
            <path
              d={
                hoodie
                  ? "M120 112 157 79 Q210 34 263 79 L300 112 370 154 340 238 302 218 302 452 118 452 118 218 80 238 50 154Z M157 79 Q210 18 263 79 L250 151 170 151Z"
                  : crop
                    ? "M126 114 168 86 210 72 252 86 294 114 366 156 336 236 298 218 298 350 122 350 122 218 84 236 54 156Z"
                    : "M126 114 168 86 210 72 252 86 294 114 366 156 336 236 298 218 298 452 122 452 122 218 84 236 54 156Z"
              }
              fill="url(#cloth)"
              stroke="#020617"
              strokeWidth="5"
            />
            <path d="M169 88 Q210 120 251 88" fill="none" stroke="#cbd5e1" strokeOpacity=".56" strokeWidth="7" />
            <path d="M122 422 H298" stroke="#020617" strokeOpacity=".45" strokeWidth="3" />
            <path d="M126 116 88 183M294 116l38 67" stroke="#f8fafc" strokeOpacity=".08" strokeWidth="4" />
          </svg>

          <div className="absolute left-1/2 top-[39%] z-10 flex h-[190px] w-[155px] -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-dashed border-orange-300/30" style={{ transform: `translate(-50%, -50%) ${transform}` }}>
            {artPreview ? (
              <img src={artPreview} alt="Uploaded artwork" className="max-h-full max-w-full object-contain drop-shadow-xl" />
            ) : side === "front" ? (
              <div className="relative grid h-28 w-28 place-items-center rounded-full border-[7px]" style={{ borderColor: accent }}>
                <div className="absolute h-16 w-16 rotate-45 rounded-2xl border-4" style={{ borderColor: second }} />
                <span className="relative text-[10px] font-black uppercase tracking-[0.22em] text-white">BHARAT</span>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto h-28 w-28 rotate-45 rounded-[28px] border-[8px]" style={{ borderColor: accent }} />
                <div className="-mt-16 text-2xl font-black tracking-[-.06em] text-white">{title.split(" ").slice(0, 2).join(" ").toUpperCase()}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InspirationCard({ item, onUse }: { item: (typeof inspirations)[number]; onUse: () => void }) {
  return (
    <button onClick={onUse} className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-left transition hover:border-slate-600">
      <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#334155,transparent_35%),linear-gradient(135deg,#0f172a,#020617)]">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `linear-gradient(135deg,transparent 0 45%,${item.accent} 45% 47%,transparent 47% 100%)` }} />
        <div className="absolute inset-0 grid place-items-center text-5xl font-black transition group-hover:scale-110" style={{ color: item.accent }}>{item.motif}</div>
        <div className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white">Trend cue</div>
      </div>
      <div className="p-2.5"><div className="text-xs font-black text-slate-200">{item.name}</div><div className="mt-1 text-[10px] text-slate-500">{item.note}</div></div>
    </button>
  );
}

export default function FashionDesignerStudio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<StudioTab>("inspiration");
  const [brand, setBrand] = useState("BharatDrip");
  const [audience, setAudience] = useState("unisex");
  const [garmentCode, setGarmentCode] = useState("US22");
  const [printMethod, setPrintMethod] = useState("Front + Back DTF");
  const [collection, setCollection] = useState("BharatDrip Drop 01");
  const [mood, setMood] = useState("Oversized Japanese streetwear, dark manga-panel energy, chrome linework, vintage wash, bold back graphic, original iconography");
  const [title, setTitle] = useState("Afterdark Signal Oversized Tee");
  const [brief, setBrief] = useState("Bold original street emblem with a small front crest and large back composition. High contrast, print-ready, clean negative space.");
  const [palette, setPalette] = useState(["#0b0b0f", "#f97316", "#f8fafc"]);
  const [garmentColor, setGarmentColor] = useState("#191d27");
  const [price, setPrice] = useState(799);
  const [side, setSide] = useState<"front" | "back">("front");
  const [zoom, setZoom] = useState(0.94);
  const [placement, setPlacement] = useState<Placement>({ x: 0, y: 0, scale: 100, rotate: 0 });
  const [artPreview, setArtPreview] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/fashion-studio", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d) setData(d);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const garments = useMemo(() => data?.garments || [], [data]);
  const compatible = useMemo(() => garments.filter(g => g.audience === audience || g.audience === "unisex" || audience === "unisex"), [garments, audience]);
  const garment = garments.find(g => g.code === garmentCode) || compatible[0] || garments[0];
  const band = data?.priceBands?.[brand] || (brand === "BharatDrip" ? { min: 599, max: 999 } : { min: 129, max: 599 });
  const estimatedLanded = Math.round((garment?.baseInr || 250) + (printEstimate[printMethod] || 100) + 88);
  const estimatedProfit = price - estimatedLanded;
  const estimatedMargin = price > 0 ? Math.round((estimatedProfit / price) * 100) : 0;

  useEffect(() => {
    if (compatible[0] && !compatible.some(g => g.code === garmentCode)) setGarmentCode(compatible[0].code);
  }, [compatible, garmentCode]);
  useEffect(() => {
    if (brand === "BharatDrip") {
      setPrintMethod("Front + Back DTF");
      if (price < 599 || price > 999) setPrice(799);
    } else {
      setPrintMethod("Pocket DTF");
      if (price < 129 || price > 599) setPrice(399);
    }
  }, [brand]);

  async function post(body: any, key: string) {
    if (busy) return null;
    setBusy(key);
    setNotice("");
    setLastResult(null);
    try {
      const r = await fetch("/api/admin/fashion-studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      setLastResult(d);
      if (!r.ok) { setNotice(d.error || "Fashion studio action was blocked."); return null; }
      return d;
    } finally { setBusy(null); }
  }

  async function makeConcept() {
    const d = await post({ action: "concept", brand, audience, garmentCode, printMethod, palette, mood, collection }, "concept");
    if (!d) return;
    const c = d.concept || {};
    setTitle(String(c.title || title));
    setBrief(String(c.designBrief || brief));
    if (Array.isArray(c.palette)) setPalette(c.palette.slice(0, 3));
    setNotice(`Concept ready via ${d.provider || "designer"}. You can edit every field before queueing.`);
  }

  async function uploadNormalPhoto(productId: number) {
    if (!photoFile) return true;
    const form = new FormData();
    form.append("productId", String(productId));
    form.append("view", "0");
    form.append("file", photoFile);
    const r = await fetch("/api/admin/fashion-studio/media", { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setNotice(`Product queued, but photo upload failed: ${d.error || `HTTP ${r.status}`}`);
      return false;
    }
    setNotice("Product queued and your normal raster photo is now the primary product image.");
    return true;
  }

  async function queueDesign() {
    const d = await post({
      action: "create",
      brand,
      audience,
      garmentCode,
      printMethod,
      palette,
      mood,
      collection,
      title,
      designBrief: brief,
      targetPriceInr: price,
      placement: { ...placement, side },
      garmentColor,
    }, "create");
    if (!d) return;
    const id = Number(d.productId);
    setSelectedProductId(id);
    if (photoFile) await uploadNormalPhoto(id);
    else setNotice(`${d.title} queued as ${d.status}. Add a normal product photo any time from Recent designs.`);
    await load();
  }

  async function uploadToExisting(productId: number) {
    if (!photoFile) {
      setSelectedProductId(productId);
      setTab("uploads");
      setNotice("Choose a JPG, PNG or WebP in Uploads, then click Upload to selected product.");
      return;
    }
    setBusy("upload-existing");
    try { await uploadNormalPhoto(productId); await load(); }
    finally { setBusy(null); }
  }

  async function runCommand(action: string) {
    if (busy) return;
    setBusy(action); setNotice("");
    try {
      const r = await fetch("/api/admin/command-centre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json().catch(() => ({}));
      setLastResult(d);
      setNotice(r.ok ? `${d.label || action} completed.` : (d.error || "Workflow returned a blocker."));
      await load();
    } finally { setBusy(null); }
  }

  function chooseArt(file: File | null, kind: "art" | "photo") {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setNotice("Use a JPG, PNG, or WebP image up to 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    if (kind === "art") setArtPreview(url);
    else { setPhotoFile(file); setPhotoPreview(url); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#070b12] text-slate-100"><div className="text-center"><Loader2 className="mx-auto animate-spin text-orange-400" /><p className="mt-3 text-sm text-slate-400">Loading Fashion Studio…</p></div></main>;

  const rail = [
    { id: "inspiration" as const, icon: Sparkles, name: "Ideas" },
    { id: "uploads" as const, icon: Upload, name: "Uploads" },
    { id: "text" as const, icon: Type, name: "Text" },
    { id: "layers" as const, icon: Layers3, name: "Layers" },
  ];

  return (
    <main className="min-h-screen bg-[#060910] text-slate-100">
      <div className="border-b border-slate-800 bg-[#090e17] px-3 py-3 md:px-5">
        <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/dashboard" className="rounded-xl border border-slate-800 p-2 text-slate-400 hover:text-white"><ArrowLeft size={18} /></a>
            <div className="rounded-xl bg-orange-500/10 p-2.5 text-orange-300"><Shirt size={20} /></div>
            <div className="min-w-0"><h1 className="truncate text-lg font-black md:text-xl">BharatShop Fashion Studio</h1><p className="hidden text-xs text-slate-500 sm:block">Trend → design → Qikink → media → CEO gate</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void makeConcept()} disabled={!!busy} className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs font-black text-orange-200 hover:bg-orange-500/20 disabled:opacity-50"><WandSparkles size={14} className="mr-1.5 inline" />AI redesign</button>
            <button onClick={() => void queueDesign()} disabled={!!busy} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-orange-400 disabled:opacity-50">{busy === "create" ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : <Save size={14} className="mr-1.5 inline" />}Queue product</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1900px] p-2 md:p-4">
        {notice ? <div className="mb-3 rounded-xl border border-orange-400/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">{notice}</div> : null}

        <div className="grid min-h-[760px] gap-3 xl:grid-cols-[82px_310px_minmax(620px,1fr)_340px]">
          <aside className={`${panel} hidden p-2 xl:block`}>
            <div className="flex flex-col gap-2">
              {rail.map(item => {
                const Icon = item.icon;
                return <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-[10px] font-bold ${tab === item.id ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:bg-slate-800"}`}><Icon size={18} /><span>{item.name}</span></button>;
              })}
            </div>
          </aside>

          <aside className={`${panel} overflow-hidden`}>
            <div className="flex gap-1 border-b border-slate-800 p-2 xl:hidden">
              {rail.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-bold ${tab === item.id ? "bg-orange-500 text-slate-950" : "text-slate-400"}`}><Icon size={13} />{item.name}</button>; })}
            </div>
            <div className="border-b border-slate-800 p-3"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input className={`${input} pl-9`} placeholder="Search trends & assets" /></div></div>
            <div className="max-h-[720px] overflow-y-auto p-3">
              {tab === "inspiration" ? <>
                <div className="mb-3"><div className="text-xs font-black">Trend & inspiration board</div><p className="mt-1 text-[11px] leading-5 text-slate-500">Use marketplace signals as design direction. Click a card to feed its style into the brief.</p></div>
                <div className="grid grid-cols-2 gap-2">{inspirations.map(item => <InspirationCard key={item.name} item={item} onUse={() => { setMood(`${item.name}: ${item.note}. ${mood}`); setPalette(v => [v[0], item.accent, v[2]]); }} />)}</div>
                <button onClick={() => void runCommand("fashion-trends")} className="mt-3 w-full rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-bold hover:border-slate-500"><RefreshCw size={13} className="mr-1.5 inline" />Refresh trend intelligence</button>
              </> : null}

              {tab === "uploads" ? <>
                <div className="text-xs font-black">Uploads</div><p className="mt-1 text-[11px] leading-5 text-slate-500">Artwork overlays stay in the editor. Product photos can be saved as the real storefront image.</p>
                <label className="mt-4 grid cursor-pointer place-items-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-5 text-center hover:border-orange-400/60"><ImagePlus className="text-orange-300" /><span className="mt-2 text-xs font-bold">Upload artwork</span><span className="mt-1 text-[10px] text-slate-500">PNG/JPG/WebP · max 8 MB</span><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { chooseArt(e.target.files?.[0] || null, "art"); e.currentTarget.value = ""; }} /></label>
                {artPreview ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2"><img src={artPreview} alt="Artwork preview" className="mx-auto max-h-44 object-contain" /><button onClick={() => setArtPreview("")} className="mt-2 w-full rounded-lg border border-slate-800 py-1.5 text-[10px] text-slate-400">Remove artwork</button></div> : null}
                <label className="mt-4 grid cursor-pointer place-items-center rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-5 text-center hover:border-emerald-400/70"><Images className="text-emerald-300" /><span className="mt-2 text-xs font-bold">Upload normal product photo</span><span className="mt-1 text-[10px] text-slate-500">This can replace the SVG card image</span><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { chooseArt(e.target.files?.[0] || null, "photo"); e.currentTarget.value = ""; }} /></label>
                {photoPreview ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2"><img src={photoPreview} alt="Product photo preview" className="mx-auto max-h-44 object-contain" /><div className="mt-2 text-[10px] text-emerald-400">Ready to upload when the product is queued.</div>{selectedProductId ? <button disabled={busy === "upload-existing"} onClick={() => void uploadToExisting(selectedProductId)} className="mt-2 w-full rounded-lg bg-emerald-500 py-2 text-[10px] font-black text-slate-950">Upload to selected product #{selectedProductId}</button> : null}</div> : null}
              </> : null}

              {tab === "text" ? <><div className="text-xs font-black">Text & naming</div><div className="mt-4"><label className={label}>Product title</label><input className={input} value={title} onChange={e => setTitle(e.target.value)} /></div><div className="mt-3"><label className={label}>Artwork brief</label><textarea className={`${input} min-h-36 resize-y`} value={brief} onChange={e => setBrief(e.target.value)} /></div><div className="mt-3"><label className={label}>Collection</label><input className={input} value={collection} onChange={e => setCollection(e.target.value)} /></div></> : null}

              {tab === "layers" ? <><div className="text-xs font-black">Canvas layers</div><div className="mt-4 space-y-2">{["Garment base", artPreview ? "Uploaded artwork" : "Studio artwork", side === "front" ? "Front placement" : "Back placement", "Product label"].map((x, i) => <div key={x} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5"><span className="text-xs text-slate-300">{x}</span><span className="rounded bg-slate-800 px-2 py-0.5 text-[9px] text-slate-500">{i + 1}</span></div>)}</div></> : null}
            </div>
          </aside>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
              <div className="flex items-center gap-2"><button onClick={() => setSide("front")} className={`rounded-lg px-3 py-2 text-xs font-black ${side === "front" ? "bg-slate-100 text-slate-950" : "bg-slate-800 text-slate-400"}`}>Front</button><button onClick={() => setSide("back")} className={`rounded-lg px-3 py-2 text-xs font-black ${side === "back" ? "bg-slate-100 text-slate-950" : "bg-slate-800 text-slate-400"}`}>Back</button></div>
              <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1"><button onClick={() => setZoom(z => Math.max(.65, z - .1))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><ZoomOut size={15} /></button><span className="min-w-12 text-center text-[10px] font-bold text-slate-500">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(1.25, z + .1))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><ZoomIn size={15} /></button></div>
            </div>
            <div className="p-3"><GarmentCanvas garment={garment?.name || "Oversized T-Shirt"} garmentColor={garmentColor} palette={palette} title={title} artPreview={artPreview} placement={placement} side={side} zoom={zoom} /></div>
            <div className="grid gap-2 border-t border-slate-800 p-3 sm:grid-cols-4">
              <div><label className={label}>X position</label><input type="range" min="-70" max="70" value={placement.x} onChange={e => setPlacement(p => ({ ...p, x: Number(e.target.value) }))} className="w-full" /></div>
              <div><label className={label}>Y position</label><input type="range" min="-90" max="90" value={placement.y} onChange={e => setPlacement(p => ({ ...p, y: Number(e.target.value) }))} className="w-full" /></div>
              <div><label className={label}>Artwork scale</label><input type="range" min="45" max="145" value={placement.scale} onChange={e => setPlacement(p => ({ ...p, scale: Number(e.target.value) }))} className="w-full" /></div>
              <div><label className={label}>Rotation</label><input type="range" min="-25" max="25" value={placement.rotate} onChange={e => setPlacement(p => ({ ...p, rotate: Number(e.target.value) }))} className="w-full" /></div>
            </div>
          </section>

          <aside className={`${panel} max-h-[860px] overflow-y-auto p-4`}>
            <div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-orange-300" /><h2 className="text-sm font-black">Production settings</h2></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div><label className={label}>Brand</label><select className={input} value={brand} onChange={e => setBrand(e.target.value)}><option>BharatDrip</option><option>BharatShop Studio</option></select></div><div><label className={label}>Audience</label><select className={input} value={audience} onChange={e => setAudience(e.target.value)}><option value="unisex">Unisex</option><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option></select></div></div>
            <div className="mt-3"><label className={label}>Qikink garment</label><select className={input} value={garmentCode} onChange={e => setGarmentCode(e.target.value)}>{compatible.map(g => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}</select><div className="mt-1 text-[10px] text-slate-500">Base ₹{garment?.baseInr || 0} · sizes {(garment?.sizes || []).join(", ")}</div></div>
            <div className="mt-3"><label className={label}>Print method</label><select className={input} value={printMethod} onChange={e => setPrintMethod(e.target.value)}>{(data?.printMethods || []).map(x => <option key={x}>{x}</option>)}</select></div>
            <div className="mt-3"><label className={label}>Garment color</label><div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2"><input type="color" value={garmentColor} onChange={e => setGarmentColor(e.target.value)} className="h-9 w-12 rounded border-0 bg-transparent" /><span className="text-xs text-slate-400">{garmentColor}</span></div></div>
            <div className="mt-3"><label className={label}>Palette</label><div className="grid grid-cols-3 gap-2">{palette.map((p, i) => <label key={i} className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-center"><input type="color" value={p} onChange={e => setPalette(v => v.map((x, j) => j === i ? e.target.value : x))} className="h-8 w-full rounded border-0 bg-transparent" /><div className="mt-1 text-[9px] text-slate-500">{p}</div></label>)}</div></div>
            <div className="mt-3"><label className={label}>Inspiration / prompt</label><textarea className={`${input} min-h-28 resize-y`} value={mood} onChange={e => setMood(e.target.value)} /></div>
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center justify-between"><div className="text-xs font-black text-emerald-300">Qikink estimate</div><ShoppingBag size={15} className="text-emerald-400" /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-950 p-2"><div className="text-[9px] uppercase text-slate-500">Est. landed</div><div className="mt-1 font-black">₹{estimatedLanded}</div></div><div className="rounded-xl bg-slate-950 p-2"><div className="text-[9px] uppercase text-slate-500">Sell price</div><div className="mt-1 font-black">₹{price}</div></div><div className="rounded-xl bg-slate-950 p-2"><div className="text-[9px] uppercase text-slate-500">Est. profit</div><div className={`mt-1 font-black ${estimatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>₹{estimatedProfit}</div></div><div className="rounded-xl bg-slate-950 p-2"><div className="text-[9px] uppercase text-slate-500">Margin</div><div className={`mt-1 font-black ${estimatedMargin >= 25 ? "text-emerald-400" : "text-amber-400"}`}>{estimatedMargin}%</div></div></div>
              <div className="mt-3"><label className={label}>Selling price · ₹{band.min}-₹{band.max}</label><input type="number" min={band.min} max={band.max} className={input} value={price} onChange={e => setPrice(Number(e.target.value))} /></div>
              <p className="mt-2 text-[9px] leading-4 text-slate-500">UI estimate only. Server-side Qikink rate card and catalog economics remain authoritative.</p>
            </div>
            <button disabled={!!busy} onClick={() => void makeConcept()} className="mt-4 w-full rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-3 text-xs font-black text-orange-200 hover:bg-orange-500/20 disabled:opacity-50">{busy === "concept" ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : <Bot size={14} className="mr-2 inline" />}Generate AI concept</button>
            <button disabled={!!busy} onClick={() => void queueDesign()} className="mt-2 w-full rounded-xl bg-orange-500 px-3 py-3 text-xs font-black text-slate-950 hover:bg-orange-400 disabled:opacity-50"><CheckCircle2 size={14} className="mr-2 inline" />Queue for CEO review</button>
            <button disabled={!!busy} onClick={() => void runCommand("fashion-fronts")} className="mt-2 w-full rounded-xl border border-slate-700 px-3 py-3 text-xs font-bold text-slate-300 hover:border-slate-500"><Sparkles size={14} className="mr-2 inline" />Generate editorial photos</button>
            <button disabled={!!busy} onClick={() => void runCommand("ceo-cycle")} className="mt-2 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-xs font-bold text-emerald-300"><Play size={14} className="mr-2 inline" />Run CEO gate</button>
          </aside>
        </div>

        <section className={`${panel} mt-3 p-4`}>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-sm font-black">Recent Fashion Studio products</div><p className="mt-1 text-xs text-slate-500">Select any design to attach a normal product photo, or send it through the CEO/listing workflow.</p></div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{data?.products?.length || 0} recent records</div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{(data?.products || []).slice(0, 10).map(product => <button key={product.id} onClick={() => { setSelectedProductId(product.id); setTab("uploads"); }} className={`overflow-hidden rounded-xl border bg-slate-950 text-left transition hover:border-orange-400/50 ${selectedProductId === product.id ? "border-orange-400" : "border-slate-800"}`}><div className="aspect-[4/3] overflow-hidden bg-slate-900"><img src={`/api/fashion-photo/${product.id}/0`} alt={product.title} className="h-full w-full object-cover" /></div><div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[.16em] text-orange-300">{product.brand}</span><span className="text-[9px] text-slate-500">{product.status}</span></div><div className="mt-1 line-clamp-2 text-xs font-black text-slate-200">{product.title}</div><div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-slate-500">₹{product.sellingPriceInr}</span><span className="font-bold text-emerald-400">{Math.round(product.marginPct)}% margin</span></div><div className="mt-2 flex items-center text-[10px] font-bold text-slate-400"><ImagePlus size={11} className="mr-1" />Attach normal photo<ChevronRight size={11} className="ml-auto" /></div></div></button>)}</div>
        </section>

        {lastResult ? <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-400">Last backend response</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{JSON.stringify(lastResult, null, 2)}</pre></details> : null}
      </div>
    </main>
  );
}
