"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  ExternalLink,
  ImagePlus,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  WandSparkles,
  Zap,
} from "lucide-react";
import FashionDesignerStudio from "@/components/FashionDesignerStudio";

type Direction = {
  trendName: string;
  garment: string;
  silhouette: string;
  finish: string;
  placement: string;
  motif: string;
  palette: string[];
  brief: string;
};

type Garment = {
  code: string;
  name: string;
  audience: string;
  sizes: string[];
  baseInr: number;
  sourceUrl?: string;
};

type DropPlan = {
  title: string;
  brand: string;
  category: string;
  trend: Direction;
  garment: Garment;
  printMethod: string;
  economics: { landedCostInr: number; sellingPriceInr: number; profitInr: number; marginPct: number };
  artworkPrompt: string;
  ugc: { provider: string; finalModel: string; batchModel: string; aspectRatio: string; prompt: string; disclosure: string };
  source: { supplier: string; sourceUrl: string; rateSource: string };
};

type Product = {
  id: number;
  sku: string;
  title: string;
  brand: string;
  status: string;
  imageUrl: string;
  sellingPriceInr: number;
  netProfitInr: number;
  marginPct: number;
  specifications: Record<string, unknown>;
};

type AgentData = {
  status: string;
  agent: string;
  trends: { status: string; summary: string; directions: Direction[]; signals: unknown[]; errors: unknown[] };
  qikink: Garment[];
  recommendedDrops: DropPlan[];
  products: Product[];
  creative: { provider: string; finalModel: string; batchModel: string; mode: string; note: string };
  pipeline: string[];
};

type StudioData = {
  status?: string;
  garments?: Garment[];
  products?: Product[];
};

const panel = "rounded-3xl border border-white/10 bg-[#10131a] shadow-[0_24px_80px_rgba(0,0,0,.32)]";
const soft = "rounded-2xl border border-white/10 bg-white/[0.035]";
const STREETWEAR_CODES = new Set(["US22", "UC22", "UT27", "UA22", "UJ31", "FC32", "MF31"]);

const FALLBACK_DIRECTIONS: Direction[] = [
  { trendName: "Night Ronin", garment: "Oversized tee", silhouette: "drop shoulder / baggy", finish: "washed charcoal", placement: "small front crest + large back print", motif: "abstract blade signal", palette: ["black", "bone", "electric red"], brief: "Original night-city streetwear with sharp line geometry and strong negative space." },
  { trendName: "Chrome Spirit", garment: "Oversized tee", silhouette: "boxy oversized", finish: "heavy cotton / vintage fade", placement: "center chest + back system", motif: "chrome abstract crest", palette: ["black", "silver", "acid orange"], brief: "Original chrome-tech graphic language with no borrowed logos or characters." },
  { trendName: "Signal Oni", garment: "Hoodie", silhouette: "loose streetwear", finish: "washed black", placement: "front symbol + back composition", motif: "original mask geometry", palette: ["black", "teal", "magenta"], brief: "Original mask-like geometry inspired by street signage rather than licensed character art." },
  { trendName: "Koi Static", garment: "AOP oversized tee", silhouette: "relaxed oversized", finish: "matte all-over print", placement: "all-over graphic field", motif: "abstract motion lines", palette: ["ink black", "off-white", "burnt orange"], brief: "Original kinetic print system with layered wave and motion cues." },
  { trendName: "Concrete Bloom", garment: "Women crop top", silhouette: "relaxed crop", finish: "soft washed cotton", placement: "front emblem", motif: "industrial floral geometry", palette: ["charcoal", "rose", "silver"], brief: "Original industrial-floral symbol system built for a compact fashion silhouette." },
  { trendName: "Midnight Circuit", garment: "Full sleeve tee", silhouette: "relaxed unisex", finish: "vintage washed", placement: "sleeve marks + chest symbol", motif: "circuit-line emblem", palette: ["black", "lime", "grey"], brief: "Original circuit-inspired linework with a clean premium streetwear read." },
];

function Money({ value }: { value: number }) {
  return <span>₹{Math.round(value || 0).toLocaleString("en-IN")}</span>;
}

function StatusPill({ value }: { value: string }) {
  const published = value.toLowerCase().includes("publish");
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${published ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>{value.replaceAll("_", " ")}</span>;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return await response.json().catch(() => null) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function fallbackData(studio: StudioData | null): AgentData {
  const garments = (studio?.garments || []).filter((g) => STREETWEAR_CODES.has(g.code));
  return {
    status: studio?.status || "READY",
    agent: "BharatDrip Fashion Designer AI",
    trends: {
      status: "SAFE_FALLBACK",
      summary: "Fast local studio mode is active. These original design directions keep the cockpit usable while live trend synthesis refreshes separately.",
      directions: FALLBACK_DIRECTIONS,
      signals: [],
      errors: [],
    },
    qikink: garments,
    recommendedDrops: [],
    products: studio?.products || [],
    creative: {
      provider: "Higgsfield",
      finalModel: "Nano Banana Pro",
      batchModel: "Nano Banana 2",
      mode: "external-plugin-bridge",
      note: "Generate in the connected Higgsfield surface, then attach the HTTPS result to a BharatDrip product below.",
    },
    pipeline: ["Trend direction", "Qikink garment", "Original design", "Higgsfield media", "Economics/IP gate", "CEO approval", "Storefront"],
  };
}

function GarmentPreview({ garment, selected, palette }: { garment: Garment; selected: boolean; palette: string[] }) {
  const isHoodie = /hood/i.test(garment.name);
  const isJacket = /jacket|varsity/i.test(garment.name);
  const isCrop = /crop/i.test(garment.name);
  const a = palette[0] || "#22d3ee";
  const b = palette[1] || "#f97316";
  const path = isHoodie
    ? "M70 58 Q110 22 150 58 L166 76 194 94 173 140 154 129 154 232 66 232 66 129 47 140 26 94 54 76Z"
    : isJacket
      ? "M68 62 94 50 110 64 126 50 152 62 194 96 171 141 154 129 154 232 66 232 66 129 49 141 26 96Z"
      : isCrop
        ? "M68 60 94 49 110 63 126 49 152 60 194 92 171 136 154 125 154 190 66 190 66 125 49 136 26 92Z"
        : "M68 60 94 49 110 63 126 49 152 60 194 92 171 136 154 125 154 232 66 232 66 125 49 136 26 92Z";
  return <div className={`relative aspect-[4/5] overflow-hidden rounded-xl border ${selected ? "border-cyan-300/70" : "border-white/10"} bg-[#090d14]`}>
    <div className="absolute inset-0 opacity-65" style={{ background: `radial-gradient(circle at 25% 20%,${a}55,transparent 38%),radial-gradient(circle at 78% 78%,${b}44,transparent 36%)` }} />
    <svg viewBox="0 0 220 270" className="relative h-full w-full drop-shadow-[0_24px_30px_rgba(0,0,0,.55)]" aria-label={`${garment.name} concept preview`}>
      <defs><linearGradient id={`cloth-${garment.code}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#273244"/><stop offset="1" stopColor="#090b10"/></linearGradient></defs>
      <path d={path} fill={`url(#cloth-${garment.code})`} stroke="#94a3b8" strokeOpacity=".32"/>
      <path d="M93 51 Q110 70 127 51" fill="none" stroke="#dbeafe" strokeOpacity=".34" strokeWidth="3"/>
      <rect x="91" y="96" width="38" height="54" rx="8" fill={a} opacity=".84"/>
      <path d="M101 111 120 136 125 113 103 142" fill="none" stroke={b} strokeWidth="5" strokeLinecap="round"/>
      <circle cx="110" cy="168" r="15" fill="none" stroke={b} strokeWidth="4" opacity=".78"/>
    </svg>
    <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">{garment.code}</div>
  </div>;
}

function ConceptHero({ direction, garment }: { direction?: Direction; garment?: Garment }) {
  const palette = direction?.palette || ["#0f172a", "#f97316", "#f8fafc"];
  return <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-violet-400/20 bg-[#080b10]">
    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 18%,${palette[1] || "#7c3aed"}55,transparent 33%),linear-gradient(150deg,#111827,#05070c 70%)` }} />
    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/60 to-transparent" />
    <div className="absolute inset-0 grid place-items-center p-7"><div className="w-[72%]"><GarmentPreview garment={garment || { code: "US22", name: "Oversized Tee", audience: "unisex", sizes: [], baseInr: 0 }} selected palette={palette}/></div></div>
    <div className="absolute bottom-4 left-4 right-4"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Concept preview</div><div className="mt-1 text-lg font-black text-white">{direction?.trendName || "BharatDrip drop"}</div><div className="mt-1 text-xs text-slate-400">{garment?.name || "Qikink garment"} · original artwork direction</div></div>
  </div>;
}

export default function FashionAgentCockpit() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTrend, setSelectedTrend] = useState(0);
  const [garmentCode, setGarmentCode] = useState("US22");
  const [plan, setPlan] = useState<DropPlan | null>(null);
  const [publishNow, setPublishNow] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [ugcUrl, setUgcUrl] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [deepStatus, setDeepStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");

  const loadFast = useCallback(async () => {
    setLoading(true);
    const studio = await fetchJson<StudioData>("/api/admin/fashion-studio", 8_000);
    if (studio) {
      const fast = fallbackData(studio);
      setData((existing) => existing ? { ...fast, trends: existing.trends, creative: existing.creative } : fast);
      if (!selectedProductId && fast.products[0]) setSelectedProductId(fast.products[0].id);
      setNotice("");
    } else {
      setNotice("Fast Fashion Studio data did not load. Sign in again or retry.");
    }
    setLoading(false);
  }, [selectedProductId]);

  const refreshTrends = useCallback(async (announce = true) => {
    setDeepStatus("loading");
    if (announce) setNotice("Refreshing live trend intelligence in the background…");
    const deep = await fetchJson<AgentData>("/api/admin/fashion-agent", 30_000);
    if (deep) {
      setData(deep);
      if (!selectedProductId && deep.products[0]) setSelectedProductId(deep.products[0].id);
      setDeepStatus("ready");
      if (announce) setNotice("Live Fashion Agent trend intelligence refreshed.");
    } else {
      setDeepStatus("fallback");
      if (announce) setNotice("Live trend refresh timed out; the fast original-design fallback remains active. Build/drop actions still use the real agent endpoint.");
    }
  }, [selectedProductId]);

  useEffect(() => {
    void loadFast().then(() => void refreshTrends(false));
  }, [loadFast, refreshTrends]);

  const direction = data?.trends.directions[selectedTrend] || data?.trends.directions[0];
  const selectedGarment = useMemo(() => data?.qikink.find((g) => g.code === garmentCode) || data?.qikink[0], [data, garmentCode]);

  async function call(body: Record<string, unknown>, key: string, timeoutMs = 125_000) {
    if (busy) return null;
    setBusy(key);
    setNotice("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("/api/admin/fashion-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      if (!response.ok) {
        setNotice(String(result.error || "Fashion Agent action failed."));
        return null;
      }
      return result;
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === "AbortError" ? "Fashion Agent timed out. No destructive retry was attempted." : "Connection failed. Check recent products before retrying.");
      return null;
    } finally {
      window.clearTimeout(timer);
      setBusy("");
    }
  }

  async function buildPlan() {
    const result = await call({ action: "plan", trendName: direction?.trendName, trendIndex: selectedTrend, garmentCode }, "plan");
    if (result?.plan) {
      setPlan(result.plan as DropPlan);
      setNotice(`${result.plan.title} is ready. Qikink costing passed and the Higgsfield UGC packet is prepared.`);
    }
  }

  async function listDrop() {
    const result = await call({ action: "queue-and-list", trendName: direction?.trendName, trendIndex: selectedTrend, garmentCode, publishNow }, "list");
    if (!result) return;
    setPlan((result.plan as DropPlan | undefined) || plan);
    setNotice(publishNow ? `${result.plan?.title || "Drop"} is listed on BharatShop.` : `${result.plan?.title || "Drop"} is safely queued as CEO_PENDING.`);
    await loadFast();
  }

  async function attachUgc() {
    if (!selectedProductId || !/^https:\/\//i.test(ugcUrl.trim())) {
      setNotice("Select a BharatDrip product and paste a valid HTTPS Higgsfield image URL.");
      return;
    }
    const result = await call({ action: "attach-ugc", productId: selectedProductId, imageUrl: ugcUrl.trim() }, "attach", 20_000);
    if (!result) return;
    setUgcUrl("");
    setNotice("Higgsfield hero attached to the selected BharatDrip product.");
    await loadFast();
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy failed. Select the prompt text manually.");
    }
  }

  if (loading && !data) {
    return <div className="min-h-[560px] bg-[#090b10] text-white grid place-items-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-400"/><p className="mt-3 text-sm text-slate-500">Loading fast Fashion Studio state…</p></div></div>;
  }

  return <div className="min-h-screen bg-[#090b10] text-slate-100">
    <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-7 md:py-7">
      <section className={`${panel} overflow-hidden`}>
        <div className="relative border-b border-white/10 px-5 py-6 md:px-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.20),transparent_34%),radial-gradient(circle_at_88%_20%,rgba(168,85,247,.12),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">AI fashion employee</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Qikink made-to-order</span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${deepStatus === "ready" ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>{deepStatus === "loading" ? "Live trends refreshing" : deepStatus === "ready" ? "Live trends ready" : "Fast studio mode"}</span>
              </div>
              <h1 className="max-w-4xl text-3xl font-black tracking-[-0.045em] text-white md:text-5xl">BharatDrip Fashion Designer AI Cockpit</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">Visual garment selection → original design direction → Higgsfield UGC → profitability/IP gate → CEO approval → BharatShop storefront.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void refreshTrends(true)} disabled={deepStatus === "loading"} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${deepStatus === "loading" ? "animate-spin" : ""}`}/>Refresh live trends</button>
              <button onClick={() => setShowStudio((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10"><Bot className="h-4 w-4"/>{showStudio ? "Hide designer" : "Open designer"}</button>
              <a href="/store" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-black"><Store className="h-4 w-4"/>Open store</a>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[1.12fr_.88fr]">
          <div className="space-y-4">
            <div className={`${soft} p-4 md:p-5`}>
              <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Trend intelligence</div><h2 className="mt-1 text-xl font-black text-white">Choose a signal, then make it original</h2></div><TrendingUp className="h-5 w-5 text-orange-400"/></div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{data?.trends.summary}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(data?.trends.directions || FALLBACK_DIRECTIONS).map((trend, index) => <button key={`${trend.trendName}-${index}`} onClick={() => { setSelectedTrend(index); setPlan(null); }} className={`rounded-2xl border p-4 text-left transition ${selectedTrend === index ? "border-orange-400 bg-orange-400/[0.08]" : "border-white/10 bg-black/10 hover:border-white/20"}`}>
                  <div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-white">{trend.trendName}</span><span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">{trend.garment}</span></div>
                  <div className="mt-2 text-xs leading-5 text-slate-400">{trend.silhouette} · {trend.finish}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">{trend.palette.slice(0,4).map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold text-slate-300">{item}</span>)}</div>
                </button>)}
              </div>
            </div>

            <div className={`${soft} p-4 md:p-5`}>
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Shirt className="h-5 w-5 text-cyan-300"/><div><div className="text-sm font-black text-white">Qikink visual garment rack</div><div className="mt-1 text-xs text-slate-500">Concept previews are labelled as previews; source links remain traceable to Qikink.</div></div></div>{selectedGarment?.sourceUrl ? <a href={selectedGarment.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-cyan-300">Source <ExternalLink className="ml-1 inline h-3.5 w-3.5"/></a> : null}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {(data?.qikink || []).map((garment) => <button key={garment.code} onClick={() => { setGarmentCode(garment.code); setPlan(null); }} className={`overflow-hidden rounded-2xl border p-2 text-left transition ${garmentCode === garment.code ? "border-cyan-400/70 bg-cyan-400/[0.08]" : "border-white/10 bg-black/10 hover:border-white/20"}`}>
                  <GarmentPreview garment={garment} selected={garmentCode === garment.code} palette={direction?.palette || ["#22d3ee","#f97316"]}/>
                  <div className="px-1 pb-1 pt-2"><div className="line-clamp-1 text-xs font-black text-white">{garment.name}</div><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{garment.sizes.length} sizes</span><span>blank <Money value={garment.baseInr}/></span></div></div>
                </button>)}
              </div>
            </div>

            <div className={`${soft} p-4 md:p-5`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Agent assignment</div><div className="mt-1 text-lg font-black text-white">{direction?.trendName || "Streetwear drop"} × {selectedGarment?.name || "Qikink blank"}</div><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">Build Drop calls the real Fashion Agent, computes Qikink economics and produces the exact Higgsfield prompt packet. It does not publish anything yet.</p></div><button onClick={() => void buildPlan()} disabled={!!busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black hover:bg-orange-400 disabled:opacity-50">{busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin"/> : <WandSparkles className="h-4 w-4"/>}Build drop</button></div>
            </div>
          </div>

          <div className="space-y-4">
            <ConceptHero direction={direction} garment={selectedGarment}/>

            <div className={`${soft} p-4 md:p-5`}>
              <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Creative engine</div><div className="mt-1 text-lg font-black text-white">Higgsfield + ChatGPT bridge</div></div><Sparkles className="h-5 w-5 text-violet-300"/></div>
              <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Final hero</div><div className="mt-1 text-sm font-black text-white">Nano Banana Pro</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Batch variants</div><div className="mt-1 text-sm font-black text-white">Nano Banana 2</div></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2.5 text-xs font-black text-cyan-200"><PlugZap className="h-4 w-4"/>Open ChatGPT</a><a href="https://higgsfield.ai/mcp" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2.5 text-xs font-black text-violet-200"><Sparkles className="h-4 w-4"/>Higgsfield connector</a></div>
              {plan ? <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-black text-white">{plan.title}</div><button onClick={() => void copy(plan.ugc.prompt, "UGC prompt")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-300"><Clipboard className="h-3.5 w-3.5"/>Copy</button></div><p className="mt-3 max-h-44 overflow-auto text-xs leading-5 text-slate-400">{plan.ugc.prompt}</p></div> : <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">Build a drop to generate the exact Higgsfield prompt packet.</div>}
            </div>

            {plan && <div className={`${soft} p-4 md:p-5`}>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300"/><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Economics + approval gate</div></div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Landed</div><div className="mt-1 text-lg font-black"><Money value={plan.economics.landedCostInr}/></div></div><div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Retail</div><div className="mt-1 text-lg font-black"><Money value={plan.economics.sellingPriceInr}/></div></div><div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Profit</div><div className="mt-1 text-lg font-black text-emerald-300"><Money value={plan.economics.profitInr}/></div></div><div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Margin</div><div className="mt-1 text-lg font-black text-emerald-300">{plan.economics.marginPct}%</div></div></div>
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3"><div><div className="text-xs font-black text-white">Publish immediately</div><div className="mt-1 text-[10px] text-slate-500">Off by default. Keep it off to create a CEO_PENDING draft first.</div></div><input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} className="h-4 w-4 accent-orange-500"/></label>
              <button onClick={() => void listDrop()} disabled={!!busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black hover:bg-slate-200 disabled:opacity-50">{busy === "list" ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShoppingBag className="h-4 w-4"/>}{publishNow ? "Create + publish" : "Create CEO-pending draft"}</button>
            </div>}
          </div>
        </div>
      </section>

      {notice && <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-100">{notice}</div>}

      <section className={`${panel} mt-5 p-4 md:p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Real media attachment</div><h2 className="mt-1 text-2xl font-black text-white">Attach Higgsfield hero to a BharatDrip product</h2><p className="mt-2 max-w-3xl text-sm text-slate-400">Generate the image through the connected Higgsfield surface, obtain its HTTPS image URL, then attach it here. The backend records Higgsfield as the media provider and updates the product hero.</p></div><button onClick={() => setShowStudio((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10"><ImagePlus className="h-4 w-4"/>{showStudio ? "Hide full designer" : "Open full designer"}</button></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[.8fr_1.5fr_auto]">
          <select value={selectedProductId || ""} onChange={(event) => setSelectedProductId(Number(event.target.value) || null)} className="rounded-xl border border-white/10 bg-[#090b10] px-3 py-3 text-sm text-white outline-none"><option value="">Select product</option>{(data?.products || []).map((product) => <option key={product.id} value={product.id}>{product.title} · {product.status}</option>)}</select>
          <input value={ugcUrl} onChange={(event) => setUgcUrl(event.target.value)} placeholder="https://… Higgsfield image URL" className="rounded-xl border border-white/10 bg-[#090b10] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400"/>
          <button onClick={() => void attachUgc()} disabled={!!busy || !selectedProductId || !ugcUrl.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black disabled:opacity-40">{busy === "attach" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Zap className="h-4 w-4"/>}Attach hero</button>
        </div>
      </section>

      <section className={`${panel} mt-5 p-4 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Agent creations</div><h2 className="mt-1 text-2xl font-black text-white">Local catalogue output</h2><p className="mt-2 text-sm text-slate-400">Local designs use BharatShop preview art immediately; Higgsfield or uploaded raster media can replace the hero when attached.</p></div><button onClick={() => void loadFast()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10"><RefreshCw className="h-4 w-4"/>Refresh products</button></div>
        {(data?.products || []).length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(data?.products || []).slice(0,9).map((product) => <div key={product.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="aspect-[4/5] bg-[#141923]">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center"><Shirt className="h-12 w-12 text-slate-700"/></div>}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-white">{product.title}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{product.sku}</div></div><StatusPill value={product.status}/></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Price</div><div className="mt-1 text-xs font-black"><Money value={product.sellingPriceInr}/></div></div><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Profit</div><div className="mt-1 text-xs font-black text-emerald-300"><Money value={product.netProfitInr}/></div></div><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Margin</div><div className="mt-1 text-xs font-black text-emerald-300">{Math.round(product.marginPct)}%</div></div></div><a href={`/store/product/${product.id}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-orange-300">Preview product <ExternalLink className="h-3.5 w-3.5"/></a></div></div>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center"><Shirt className="mx-auto h-10 w-10 text-slate-700"/><div className="mt-3 text-sm font-black text-white">No local BharatDrip drafts yet</div><p className="mt-1 text-xs text-slate-500">Build a drop above or open the full designer to create the first CEO_PENDING product.</p></div>}
      </section>

      <section className={`${panel} mt-5 p-4 md:p-6`}><div className="flex flex-wrap items-center gap-2">{(data?.pipeline || []).map((item, index) => <div key={item} className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300"/>{item}</span>{index < (data?.pipeline.length || 0)-1 && <ChevronRight className="h-3.5 w-3.5 text-slate-700"/>}</div>)}</div></section>

      {showStudio && <div className="mt-5"><FashionDesignerStudio/></div>}
    </div>
  </div>;
}
