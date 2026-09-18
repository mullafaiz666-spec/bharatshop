"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  ExternalLink,
  Loader2,
  RefreshCw,
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
  sourceUrl: string;
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
  specifications: any;
};

type AgentData = {
  status: string;
  agent: string;
  trends: { status: string; summary: string; directions: Direction[]; signals: any[]; errors: any[] };
  qikink: Garment[];
  recommendedDrops: DropPlan[];
  products: Product[];
  creative: { provider: string; finalModel: string; batchModel: string; mode: string; note: string };
  pipeline: string[];
};

const panel = "rounded-3xl border border-white/10 bg-[#10131a] shadow-[0_24px_80px_rgba(0,0,0,.32)]";
const soft = "rounded-2xl border border-white/10 bg-white/[0.035]";

function Money({ value }: { value: number }) {
  return <span>₹{Math.round(value || 0).toLocaleString("en-IN")}</span>;
}

function StatusPill({ value }: { value: string }) {
  const published = value.toLowerCase().includes("publish");
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${published ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export default function FashionAgentCockpit() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTrend, setSelectedTrend] = useState(0);
  const [garmentCode, setGarmentCode] = useState("US22");
  const [plan, setPlan] = useState<DropPlan | null>(null);
  const [publishNow, setPublishNow] = useState(true);
  const [showStudio, setShowStudio] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const r = await fetch("/api/admin/fashion-agent", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d) setData(d);
    else setNotice("Fashion Agent could not load. Refresh or sign in again.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const direction = data?.trends.directions[selectedTrend] || data?.trends.directions[0];
  const selectedGarment = useMemo(() => data?.qikink.find((g) => g.code === garmentCode) || data?.qikink[0], [data, garmentCode]);

  async function call(body: any, key: string) {
    if (busy) return null;
    setBusy(key);
    setNotice("");
    try {
      const r = await fetch("/api/admin/fashion-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok) {
        setNotice(d.error || "Fashion Agent action failed.");
        return null;
      }
      return d;
    } catch {
      setNotice("Connection failed. Check the latest products before retrying.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function buildPlan() {
    const d = await call({ action: "plan", trendName: direction?.trendName, trendIndex: selectedTrend, garmentCode }, "plan");
    if (d?.plan) {
      setPlan(d.plan);
      setNotice(`${d.plan.title} is ready: Qikink costing passed and Higgsfield UGC prompt packet is prepared.`);
    }
  }

  async function queueAutom8Fashion(product: Product) {
    if (busy) return;
    setBusy(`autom8-${product.id}`);
    setNotice("");
    try {
      const r = await fetch("/api/automation/autom8ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fashion-creative",
          productId: product.id,
          objective: "Create an original BharatDrip campaign concept and short-form UGC/video brief while preserving the approved garment, artwork direction, IP policy and economics.",
        }),
      });
      const d = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok) {
        setNotice(d.error || "Autom8AI fashion workflow failed.");
        return;
      }
      const job = d.result?.remoteJobId ? ` Job ${d.result.remoteJobId}.` : "";
      setNotice(`Autom8AI creative workflow accepted for ${product.title}.${job} Returned assets remain review-only; no auto-publish or ad spend.`);
    } catch {
      setNotice("Autom8AI connection failed. Check the webhook configuration and retry.");
    } finally {
      setBusy("");
    }
  }

  async function listDrop() {
    const d = await call({ action: "queue-and-list", trendName: direction?.trendName, trendIndex: selectedTrend, garmentCode, publishNow }, "list");
    if (!d) return;
    setPlan(d.plan || plan);
    setNotice(publishNow ? `${d.plan?.title || "Drop"} is now listed on the BharatShop store.` : `${d.plan?.title || "Drop"} is queued for CEO approval.`);
    await load();
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
    return <div className="min-h-screen bg-[#090b10] text-white grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-orange-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-7 md:py-7">
        <section className={`${panel} overflow-hidden`}>
          <div className="relative border-b border-white/10 px-5 py-6 md:px-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.20),transparent_34%),radial-gradient(circle_at_88%_20%,rgba(168,85,247,.12),transparent_30%)]" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">AI fashion employee</span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Qikink made-to-order</span>
                  <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Higgsfield UGC ready</span>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Autom8AI orchestration</span>
                </div>
                <h1 className="max-w-4xl text-3xl font-black tracking-[-0.045em] text-white md:text-5xl">BharatDrip Fashion Designer AI Cockpit</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">Live trends → Qikink blank selection → original streetwear direction → Higgsfield UGC creative → profitability/IP gate → BharatShop listing.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Refresh trends</button>
                <a href="/store" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-black"><Store className="h-4 w-4" /> Open store</a>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[1.08fr_.92fr]">
            <div className="space-y-4">
              <div className={`${soft} p-4 md:p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Trend intelligence</div><h2 className="mt-1 text-xl font-black text-white">Pick the signal, not somebody else’s artwork</h2></div>
                  <TrendingUp className="h-5 w-5 text-orange-400" />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{data?.trends.summary}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(data?.trends.directions || []).map((t, i) => (
                    <button key={`${t.trendName}-${i}`} onClick={() => { setSelectedTrend(i); setPlan(null); }} className={`rounded-2xl border p-4 text-left transition ${selectedTrend === i ? "border-orange-400 bg-orange-400/[0.08]" : "border-white/10 bg-black/10 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-white">{t.trendName}</span><span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">{t.garment}</span></div>
                      <div className="mt-2 text-xs leading-5 text-slate-400">{t.silhouette} · {t.finish}</div>
                      <div className="mt-3 flex gap-1.5">{t.palette.slice(0, 4).map((p) => <span key={p} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold text-slate-300">{p}</span>)}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${soft} p-4 md:p-5`}>
                <div className="flex items-center gap-2"><Shirt className="h-5 w-5 text-cyan-300" /><div className="text-sm font-black text-white">Qikink Streetwear Rack</div></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(data?.qikink || []).map((g) => (
                    <button key={g.code} onClick={() => { setGarmentCode(g.code); setPlan(null); }} className={`rounded-xl border p-3 text-left ${garmentCode === g.code ? "border-cyan-400/70 bg-cyan-400/[0.08]" : "border-white/10 bg-black/10 hover:border-white/20"}`}>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{g.code}</div>
                      <div className="mt-1 text-xs font-black text-white">{g.name}</div>
                      <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{g.sizes.length} sizes</span><span>blank <Money value={g.baseInr} /></span></div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${soft} p-4 md:p-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Agent assignment</div>
                    <div className="mt-1 text-lg font-black text-white">{direction?.trendName || "Streetwear drop"} × {selectedGarment?.name || "Qikink blank"}</div>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">The agent converts the trend into original IP-safe art and keeps the garment source, production cost, creative prompt and listing traceable.</p>
                  </div>
                  <button onClick={() => void buildPlan()} disabled={!!busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black hover:bg-orange-400 disabled:opacity-50">
                    {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Build drop
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`${soft} p-4 md:p-5`}>
                <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Creative engine</div><div className="mt-1 text-lg font-black text-white">Higgsfield UGC</div></div><Sparkles className="h-5 w-5 text-violet-300" /></div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Final hero</div><div className="mt-1 text-sm font-black text-white">Nano Banana Pro</div></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Batch variants</div><div className="mt-1 text-sm font-black text-white">Nano Banana 2</div></div>
                </div>
                {plan ? (
                  <>
                    <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
                      <div className="flex items-center justify-between gap-3"><div className="text-sm font-black text-white">{plan.title}</div><button onClick={() => void copy(plan.ugc.prompt, "UGC prompt")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-300"><Clipboard className="h-3.5 w-3.5" /> Copy</button></div>
                      <p className="mt-3 max-h-44 overflow-auto text-xs leading-5 text-slate-400">{plan.ugc.prompt}</p>
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-[11px] leading-5 text-amber-100/80"><Zap className="mt-0.5 h-4 w-4 shrink-0" />Use the connected Higgsfield plugin in ChatGPT for the rendered UGC asset, then attach the result as the product hero. The store agent does not invent undocumented Higgsfield API fields.</div>
                  </>
                ) : <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-7 text-center text-xs text-slate-500">Build a drop to generate the exact UGC prompt packet.</div>}
              </div>

              {plan && (
                <div className={`${soft} p-4 md:p-5`}>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Economics gate</div>
                  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Landed</div><div className="mt-1 text-lg font-black"><Money value={plan.economics.landedCostInr} /></div></div>
                    <div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Retail</div><div className="mt-1 text-lg font-black"><Money value={plan.economics.sellingPriceInr} /></div></div>
                    <div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Profit</div><div className="mt-1 text-lg font-black text-emerald-300"><Money value={plan.economics.profitInr} /></div></div>
                    <div className="rounded-xl bg-black/20 p-3"><div className="text-[9px] text-slate-500">Margin</div><div className="mt-1 text-lg font-black text-emerald-300">{plan.economics.marginPct}%</div></div>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <div><div className="text-xs font-black text-white">List immediately after safety/economics gates</div><div className="mt-1 text-[10px] text-slate-500">Turn off to keep it CEO_PENDING.</div></div>
                    <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                  </label>
                  <button onClick={() => void listDrop()} disabled={!!busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.13em] text-black hover:bg-slate-200 disabled:opacity-50">
                    {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} {publishNow ? "Create + list on BharatShop" : "Create + send to CEO"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {notice && <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-100">{notice}</div>}

        <section className={`${panel} mt-5 p-4 md:p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Agent creations</div><h2 className="mt-1 text-2xl font-black text-white">Live catalogue output</h2><p className="mt-2 text-sm text-slate-400">Every listed design keeps its Qikink mapping, costing, trend direction and creative provenance.</p></div>
            <button onClick={() => setShowStudio((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10"><Bot className="h-4 w-4" /> {showStudio ? "Hide manual studio" : "Open manual studio"}</button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.products || []).slice(0, 9).map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="aspect-[16/9] bg-[#141923]">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Shirt className="h-10 w-10 text-slate-700" /></div>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-white">{p.title}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{p.sku}</div></div><StatusPill value={p.status} /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Price</div><div className="mt-1 text-xs font-black"><Money value={p.sellingPriceInr} /></div></div><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Profit</div><div className="mt-1 text-xs font-black text-emerald-300"><Money value={p.netProfitInr} /></div></div><div className="rounded-lg bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">Margin</div><div className="mt-1 text-xs font-black text-emerald-300">{Math.round(p.marginPct)}%</div></div></div>
                  <div className="mt-3 flex flex-wrap items-center gap-3"><a href={`/store/product/${p.id}`} className="inline-flex items-center gap-1.5 text-xs font-black text-orange-300">View product <ExternalLink className="h-3.5 w-3.5" /></a><button onClick={() => void queueAutom8Fashion(p)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-200 disabled:opacity-50">{busy === `autom8-${p.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Autom8AI creative</button></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panel} mt-5 p-4 md:p-6`}>
          <div className="flex flex-wrap items-center gap-2">
            {(data?.pipeline || []).map((p, i) => <div key={p} className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />{p}</span>{i < (data?.pipeline.length || 0) - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-700" />}</div>)}
          </div>
        </section>

        {showStudio && <div className="mt-5"><FashionDesignerStudio /></div>}
      </div>
    </div>
  );
}
