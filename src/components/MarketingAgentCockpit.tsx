"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Product = {
  id: number;
  title: string;
  imageUrl: string;
  category: string;
  sellingPriceInr: string;
  netProfitInr: string;
  stockCount: number;
  aiMarketingCopy: string;
  aiTargetAudience: string;
  status: string;
};

type Campaign = {
  id: number;
  productId: number;
  productTitle: string;
  platform: string;
  campaignType: string;
  headline: string;
  bodyText: string;
  ctaText: string;
  targetAudience: string;
  budgetInr: string;
  estimatedReachK: number;
  estimatedRoas: string;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueGeneratedInr: string;
  createdAt: string;
  scheduledAt: string | null;
};

type Order = {
  id: number;
  orderNumber: string;
  productTitle: string;
  quantity: number;
  customerPaidInr: string;
  netProfitInr: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  orderedAt: string;
};

type Connection = {
  key: string;
  label: string;
  configured: boolean;
  connected: boolean;
  status: "NOT_CONFIGURED" | "NOT_TESTED" | "VERIFIED" | "BROKEN";
  missing: string[];
  error?: string;
};

type CalendarItem = {
  id: string;
  date: string;
  title: string;
  channel: string;
  pillar: string;
  done: boolean;
};

type LibraryItem = {
  id: string;
  name: string;
  category: string;
  text: string;
  createdAt: string;
};

type RoutineItem = {
  id: string;
  title: string;
  cadence: string;
  done: boolean;
};

type AgentRun = {
  id: string;
  objective: string;
  result: unknown;
  createdAt: string;
};

type Workspace = {
  version: number;
  calendar: CalendarItem[];
  library: LibraryItem[];
  routines: RoutineItem[];
  pillarScores: Record<string, number>;
  reviewNotes: Record<string, string>;
  agentRuns: AgentRun[];
};

type CockpitData = {
  workspace: Workspace;
  campaigns: Campaign[];
  products: Product[];
  orders: Order[];
  activity: Array<{ id: number; agentName: string; actionType: string; message: string; status: string; createdAt: string }>;
  connections: Connection[];
  summary: {
    campaignCount: number;
    productCount: number;
    orderCount: number;
    orderRevenueInr: number;
    orderProfitInr: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
  safety: { paidSpendEnabled: boolean; externalCampaignCreation: string; activation: string };
  serverTime: string;
};

const TABS = ["Overview", "Pipeline", "Calendar", "Performance", "Library", "Routines", "Review", "Connections", "Agent"] as const;
const PILLARS = ["Acquisition", "Creative", "Conversion", "Catalog", "Retention"];
const CHANNELS = ["Instagram Reels", "Facebook", "Google Shopping", "SEO", "Email"];
const DEFAULT_ROUTINES: RoutineItem[] = [
  { id: "r-trends", title: "Review product trends and competitor angles", cadence: "Daily", done: false },
  { id: "r-comments", title: "Review comments, DMs and customer objections", cadence: "Daily", done: false },
  { id: "r-campaigns", title: "Check campaign health and broken connections", cadence: "Daily", done: false },
  { id: "r-creative", title: "Create or repurpose one organic asset", cadence: "Daily", done: false },
  { id: "r-products", title: "Pick the next product/offer to promote", cadence: "Weekly", done: false },
  { id: "r-review", title: "Complete marketing scorecard and decisions", cadence: "Weekly", done: false },
];

const emptyWorkspace = (): Workspace => ({
  version: 2,
  calendar: [],
  library: [],
  routines: DEFAULT_ROUTINES,
  pillarScores: {},
  reviewNotes: {},
  agentRuns: [],
});

const uid = () => Math.random().toString(36).slice(2, 10);
const inr = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const dateLabel = (value: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined });
};

function starterCalendar(): CalendarItem[] {
  const start = new Date(`${today()}T00:00:00`);
  const tasks = [
    "Feature one winning product with a clear outcome hook",
    "Publish a customer-objection carousel",
    "Create a short product demo / use-case Reel",
    "Refresh one Google Shopping title and description",
    "Repurpose the week's best post into a second channel",
    "Publish a trust/proof post: delivery, quality or returns",
    "Review performance and plan the next seven days",
  ];
  return Array.from({ length: 30 }, (_, index) => {
    const d = new Date(start);
    d.setDate(d.getDate() + index);
    return {
      id: uid(),
      date: d.toISOString().slice(0, 10),
      title: tasks[index % tasks.length],
      channel: CHANNELS[index % CHANNELS.length],
      pillar: PILLARS[index % PILLARS.length],
      done: false,
    };
  });
}

const card = "rounded-2xl border border-white/10 bg-slate-950/70 shadow-xl shadow-black/10";
const input = "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-lime-300/70";
const btn = "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-100 transition hover:border-lime-300/50 hover:text-lime-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "rounded-xl bg-lime-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40";

export default function MarketingAgentCockpit() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [data, setData] = useState<CockpitData | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace());
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [launch, setLaunch] = useState({ productId: "", platform: "Instagram Reels", campaignType: "NEW_LAUNCH", headline: "", bodyText: "", ctaText: "Shop now", targetAudience: "", budgetInr: "0" });
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [calendarDraft, setCalendarDraft] = useState({ date: today(), title: "", channel: "Instagram Reels", pillar: "Acquisition" });
  const [assetDraft, setAssetDraft] = useState({ name: "", category: "Creative", text: "" });
  const [routineDraft, setRoutineDraft] = useState("");
  const [organicPack, setOrganicPack] = useState<any>(null);
  const [objective, setObjective] = useState("");
  const [agentResult, setAgentResult] = useState<unknown>(null);

  async function readJson(response: Response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  async function refreshAll() {
    setBusy("refresh");
    setError("");
    try {
      const body = await readJson(await fetch("/api/marketing/cockpit", { cache: "no-store" })) as CockpitData;
      setData(body);
      setConnections(body.connections || []);
      const loaded = body.workspace && typeof body.workspace === "object" ? body.workspace : emptyWorkspace();
      setWorkspace({ ...emptyWorkspace(), ...loaded, routines: loaded.routines?.length ? loaded.routines : DEFAULT_ROUTINES });
      if (!launch.productId && body.products?.length) {
        const requestedId = new URLSearchParams(window.location.search).get("productId");
        const p = body.products.find((item) => String(item.id) === requestedId) || body.products.find((item) => item.status === "Published") || body.products[0];
        if (requestedId) setTab("Pipeline");
        setLaunch((current) => ({ ...current, productId: String(p.id), bodyText: p.aiMarketingCopy || "", targetAudience: p.aiTargetAudience || "" }));
      }
      hydrated.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Marketing Agent cockpit");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => { void refreshAll(); }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await readJson(await fetch("/api/marketing/cockpit", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace }),
        }));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  const product = useMemo(() => data?.products.find((item) => String(item.id) === launch.productId), [data?.products, launch.productId]);
  const activeCampaigns = useMemo(() => (data?.campaigns || []).filter((campaign) => campaign.status !== "ARCHIVED"), [data?.campaigns]);
  const archivedCampaigns = useMemo(() => (data?.campaigns || []).filter((campaign) => campaign.status === "ARCHIVED"), [data?.campaigns]);
  const calendarDone = workspace.calendar.filter((item) => item.done).length;
  const totalCampaignRevenue = (data?.campaigns || []).reduce((sum, campaign) => sum + Number(campaign.revenueGeneratedInr || 0), 0);

  function selectProduct(id: string) {
    const next = data?.products.find((item) => String(item.id) === id);
    setLaunch((current) => ({ ...current, productId: id, bodyText: next?.aiMarketingCopy || "", targetAudience: next?.aiTargetAudience || "" }));
  }

  async function createCampaign() {
    if (!launch.productId) return setError("Select a product first.");
    setBusy("launch"); setError("");
    try {
      await readJson(await fetch("/api/marketing/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: Number(launch.productId),
          platforms: [launch.platform],
          campaignType: launch.campaignType,
          headline: launch.headline || undefined,
          bodyText: launch.bodyText || undefined,
          ctaText: launch.ctaText || undefined,
          targetAudience: launch.targetAudience || undefined,
          budgetInr: Math.max(0, Number(launch.budgetInr || 0)),
        }),
      }));
      setLaunch((current) => ({ ...current, headline: "", budgetInr: "0" }));
      await refreshAll();
      setTab("Pipeline");
    } catch (e) { setError(e instanceof Error ? e.message : "Campaign creation failed"); }
    finally { setBusy(""); }
  }

  async function mutateCampaign(action: string, campaignId: number, extra: Record<string, unknown> = {}) {
    setBusy(`${action}-${campaignId}`); setError("");
    try {
      await readJson(await fetch("/api/marketing/cockpit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaignId, ...extra }),
      }));
      setEditing(null);
      await refreshAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Campaign update failed"); }
    finally { setBusy(""); }
  }

  async function createMetaPaused(campaign: Campaign) {
    if (!window.confirm(`Create a PAUSED Meta campaign for ${campaign.productTitle}? This does not enable spend.`)) return;
    setBusy(`meta-${campaign.id}`); setError("");
    try {
      await readJson(await fetch("/api/marketing/meta/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, approved: true }),
      }));
      await refreshAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Meta handoff failed"); }
    finally { setBusy(""); }
  }

  async function verifyConnections() {
    setBusy("connections"); setError("");
    try {
      const body = await readJson(await fetch("/api/marketing/connections", { method: "POST" }));
      setConnections(body.channels || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection check failed"); }
    finally { setBusy(""); }
  }

  async function generateOrganicPack() {
    setBusy("organic"); setError("");
    try {
      const body = await readJson(await fetch("/api/marketing/organic-pack", { cache: "no-store" }));
      setOrganicPack(body);
      setTab("Library");
    } catch (e) { setError(e instanceof Error ? e.message : "Organic pack generation failed"); }
    finally { setBusy(""); }
  }

  function saveOrganicPack() {
    if (!organicPack?.posts?.length) return;
    const items: LibraryItem[] = organicPack.posts.flatMap((post: any) => [
      { id: uid(), name: `${post.sku || post.productId} · Instagram`, category: "Organic Social", text: post.instagram || "", createdAt: new Date().toISOString() },
      { id: uid(), name: `${post.sku || post.productId} · Facebook`, category: "Organic Social", text: post.facebook || "", createdAt: new Date().toISOString() },
      { id: uid(), name: `${post.sku || post.productId} · Google Business`, category: "Organic Social", text: post.googleBusinessProfile || "", createdAt: new Date().toISOString() },
    ]).filter((item: LibraryItem) => item.text);
    setWorkspace((current) => ({ ...current, library: [...items, ...current.library].slice(0, 500) }));
    setOrganicPack(null);
  }

  async function runAgent() {
    if (!objective.trim()) return;
    setBusy("agent"); setError(""); setAgentResult(null);
    try {
      const context = product ? { selectedProduct: product, liveSummary: data?.summary, campaignCount: data?.campaigns.length } : { liveSummary: data?.summary };
      const result = await readJson(await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "marketing", objective: objective.trim(), context }),
      }));
      setAgentResult(result);
      const run: AgentRun = { id: uid(), objective: objective.trim(), result, createdAt: new Date().toISOString() };
      setWorkspace((current) => ({ ...current, agentRuns: [run, ...current.agentRuns].slice(0, 20) }));
    } catch (e) { setError(e instanceof Error ? e.message : "Marketing Agent failed"); }
    finally { setBusy(""); }
  }

  function copy(text: string) { void navigator.clipboard?.writeText(text); }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `bharatshop-marketing-cockpit-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function importWorkspaceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Workspace>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid backup file");
      setWorkspace({
        ...emptyWorkspace(),
        ...parsed,
        version: 2,
        calendar: Array.isArray(parsed.calendar) ? parsed.calendar : [],
        library: Array.isArray(parsed.library) ? parsed.library : [],
        routines: Array.isArray(parsed.routines) && parsed.routines.length ? parsed.routines : DEFAULT_ROUTINES,
        pillarScores: parsed.pillarScores && typeof parsed.pillarScores === "object" ? parsed.pillarScores : {},
        reviewNotes: parsed.reviewNotes && typeof parsed.reviewNotes === "object" ? parsed.reviewNotes : {},
        agentRuns: Array.isArray(parsed.agentRuns) ? parsed.agentRuns.slice(0, 20) : [],
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import cockpit backup");
    }
  }

  function addCalendar() {
    if (!calendarDraft.title.trim()) return;
    setWorkspace((current) => ({ ...current, calendar: [...current.calendar, { id: uid(), ...calendarDraft, title: calendarDraft.title.trim(), done: false }].sort((a, b) => a.date.localeCompare(b.date)) }));
    setCalendarDraft((current) => ({ ...current, title: "" }));
  }

  function addAsset() {
    if (!assetDraft.name.trim() || !assetDraft.text.trim()) return;
    setWorkspace((current) => ({ ...current, library: [{ id: uid(), ...assetDraft, name: assetDraft.name.trim(), text: assetDraft.text.trim(), createdAt: new Date().toISOString() }, ...current.library] }));
    setAssetDraft({ name: "", category: "Creative", text: "" });
  }

  function addRoutine() {
    if (!routineDraft.trim()) return;
    setWorkspace((current) => ({ ...current, routines: [...current.routines, { id: uid(), title: routineDraft.trim(), cadence: "Custom", done: false }] }));
    setRoutineDraft("");
  }

  function scoreKey(pillar: string) { return `${new Date().toISOString().slice(0, 7)}|${pillar}`; }
  const reviewKey = new Date().toISOString().slice(0, 10);

  return <main className="min-h-screen bg-[#0b0c0e] text-slate-100">
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0c0e]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-lime-300 to-violet-500" />
        <div>
          <div className="font-black tracking-tight">BharatShop · Marketing Agent Cockpit</div>
          <div className="text-xs text-slate-400">Organic growth + campaign operations + Meta/Google connection control</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save error" : "Synced"}</span>
          <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-xs font-bold text-lime-200">Spend: OFF</span>
          <button className={btn} onClick={() => void refreshAll()} disabled={busy === "refresh"}>↻ Refresh</button>
          <button className={btn} onClick={exportWorkspace}>Export</button>
          <button className={btn} onClick={() => importRef.current?.click()}>Import</button>
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importWorkspaceFile(event)} />
          <Link className={btn} href="/dashboard/fashion">Fashion Studio</Link>
          <Link className={btn} href="/dashboard">Dashboard</Link>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((name) => <button key={name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold transition ${tab === name ? "border-lime-300 text-lime-200" : "border-transparent text-slate-400 hover:text-white"}`}>{name}</button>)}
      </nav>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {error && <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100"><span>{error}</span><button onClick={() => setError("")} className="font-black">×</button></div>}

      {tab === "Overview" && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Fully paid order value", inr(data?.summary.orderRevenueInr || 0), `Latest ${data?.summary.orderCount || 0} orders · excludes COD deposits`],
            ["Estimated paid-order profit", inr(data?.summary.orderProfitInr || 0), "Latest orders marked PAID; excludes COD deposits"],
            ["Campaign conversions", String(data?.summary.conversions || 0), `${pct(data?.summary.clicks || 0, data?.summary.impressions || 0)} CTR`],
            ["Campaign revenue", inr(totalCampaignRevenue), `${activeCampaigns.length} active/local campaigns`],
          ].map(([label, value, note]) => <div key={label} className={`${card} p-5`}><div className="text-2xl font-black tracking-tight">{value}</div><div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-3 text-xs text-slate-500">{note}</div></div>)}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Operating funnel</h2><p className="text-xs text-slate-400">Live fields from BharatShop campaign records.</p></div><button className={btn} onClick={() => setTab("Performance")}>Open metrics</button></div>
            <div className="mt-5 space-y-4">
              {[
                ["Impressions", data?.summary.impressions || 0, data?.summary.impressions || 1],
                ["Clicks", data?.summary.clicks || 0, data?.summary.impressions || 0],
                ["Conversions", data?.summary.conversions || 0, data?.summary.clicks || 0],
              ].map(([label, value, base], index) => {
                const width = index === 0 ? 100 : base ? Math.min(100, (Number(value) / Number(base)) * 100) : 0;
                return <div key={String(label)}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><b>{Number(value).toLocaleString("en-IN")}{index ? ` · ${pct(Number(value), Number(base))}` : ""}</b></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-lime-300" style={{ width: `${width}%` }} /></div></div>;
              })}
            </div>
          </section>

          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Content execution</h2><p className="text-xs text-slate-400">Your cockpit calendar is synchronized to PostgreSQL-backed state.</p></div><button className={btn} onClick={() => setTab("Calendar")}>Open calendar</button></div>
            <div className="mt-5 text-3xl font-black">{calendarDone} / {workspace.calendar.length}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-400" style={{ width: `${workspace.calendar.length ? (calendarDone / workspace.calendar.length) * 100 : 0}%` }} /></div>
            <div className="mt-5 flex flex-wrap gap-2"><button className={primary} onClick={() => void generateOrganicPack()} disabled={busy === "organic"}>{busy === "organic" ? "Generating…" : "Generate free organic pack"}</button><button className={btn} onClick={() => setWorkspace((current) => ({ ...current, calendar: starterCalendar() }))}>Load 30-day plan</button></div>
          </section>
        </div>

        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Connection health</h2><p className="text-xs text-slate-400">No credentials are exposed here. Provider checks are read-only.</p></div><button className={btn} onClick={() => void verifyConnections()} disabled={busy === "connections"}>{busy === "connections" ? "Checking…" : "Verify connections"}</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{connections.map((connection) => <button key={connection.key} onClick={() => setTab("Connections")} className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-left hover:border-lime-300/30"><div className="text-sm font-bold">{connection.label}</div><div className={`mt-1 text-xs font-bold ${connection.status === "VERIFIED" ? "text-emerald-300" : connection.status === "BROKEN" ? "text-rose-300" : "text-amber-200"}`}>{connection.status.replaceAll("_", " ")}</div></button>)}</div>
        </section>
      </div>}

      {tab === "Pipeline" && <div className="space-y-5">
        <section className={`${card} p-5`}>
          <h2 className="font-black">Create campaign payload</h2><p className="mt-1 text-xs text-slate-400">Creates a real BharatShop campaign record. External paid activation remains approval-gated.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <label className="text-xs text-slate-400">Product<select className={`${input} mt-1`} value={launch.productId} onChange={(e) => selectProduct(e.target.value)}><option value="">Select product</option>{data?.products.map((p) => <option key={p.id} value={p.id}>{p.title} · {inr(p.sellingPriceInr)}</option>)}</select></label>
            <label className="text-xs text-slate-400">Platform<select className={`${input} mt-1`} value={launch.platform} onChange={(e) => setLaunch({ ...launch, platform: e.target.value })}>{["Instagram Reels", "Facebook Ads", "Google Shopping", "Organic Social", "Email"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="text-xs text-slate-400">Budget / cap (₹)<input className={`${input} mt-1`} type="number" min="0" value={launch.budgetInr} onChange={(e) => setLaunch({ ...launch, budgetInr: e.target.value })} /></label>
            <label className="text-xs text-slate-400 lg:col-span-2">Headline<input className={`${input} mt-1`} value={launch.headline} onChange={(e) => setLaunch({ ...launch, headline: e.target.value })} placeholder={product ? `${product.title} — Smart Price, Fast Delivery` : "Campaign headline"} /></label>
            <label className="text-xs text-slate-400">CTA<input className={`${input} mt-1`} value={launch.ctaText} onChange={(e) => setLaunch({ ...launch, ctaText: e.target.value })} /></label>
            <label className="text-xs text-slate-400 lg:col-span-2">Body<textarea className={`${input} mt-1 min-h-24`} value={launch.bodyText} onChange={(e) => setLaunch({ ...launch, bodyText: e.target.value })} /></label>
            <label className="text-xs text-slate-400">Audience<textarea className={`${input} mt-1 min-h-24`} value={launch.targetAudience} onChange={(e) => setLaunch({ ...launch, targetAudience: e.target.value })} /></label>
          </div>
          <div className="mt-4 flex items-center gap-3"><button className={primary} onClick={() => void createCampaign()} disabled={busy === "launch" || !launch.productId}>{busy === "launch" ? "Creating…" : "Create campaign"}</button><span className="text-xs text-slate-500">Published profitable products pass through the existing eligibility gate.</span></div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          {activeCampaigns.map((campaign) => <article key={campaign.id} className={`${card} p-5`}>
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-lime-200">{campaign.platform} · #{campaign.id}</div><h3 className="mt-1 font-black">{campaign.headline}</h3><p className="mt-1 text-xs text-slate-400">{campaign.productTitle}</p></div><span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold">{campaign.status}</span></div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{campaign.bodyText}</p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div className="rounded-lg bg-white/[.03] p-2"><b className="block text-sm">{campaign.impressions}</b>Impr.</div><div className="rounded-lg bg-white/[.03] p-2"><b className="block text-sm">{campaign.clicks}</b>Clicks</div><div className="rounded-lg bg-white/[.03] p-2"><b className="block text-sm">{campaign.conversions}</b>Conv.</div><div className="rounded-lg bg-white/[.03] p-2"><b className="block text-sm">{inr(campaign.revenueGeneratedInr)}</b>Revenue</div></div>
            <div className="mt-4 flex flex-wrap gap-2"><button className={btn} onClick={() => setEditing(campaign)}>Edit</button>{/facebook|instagram|meta/i.test(campaign.platform) && ["DRAFT", "READY_FOR_CONNECTOR"].includes(campaign.status) && <button className={primary} onClick={() => void createMetaPaused(campaign)} disabled={busy === `meta-${campaign.id}`}>{busy === `meta-${campaign.id}` ? "Creating…" : "Create Meta PAUSED"}</button>}<button className={btn} onClick={() => void mutateCampaign("archiveCampaign", campaign.id)}>Archive</button></div>
          </article>)}
          {!activeCampaigns.length && <div className={`${card} p-8 text-center text-sm text-slate-400`}>No campaign records yet. Create the first one above.</div>}
        </div>
        {!!archivedCampaigns.length && <details className={`${card} p-5`}><summary className="cursor-pointer font-bold">Archived campaigns ({archivedCampaigns.length})</summary><div className="mt-3 space-y-2">{archivedCampaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[.03] p-3"><span className="text-sm">{campaign.productTitle} · {campaign.platform}</span><button className={btn} onClick={() => void mutateCampaign("restoreCampaign", campaign.id)}>Restore</button></div>)}</div></details>}
      </div>}

      {tab === "Calendar" && <div className="space-y-5">
        <section className={`${card} p-5`}><div className="grid gap-3 lg:grid-cols-5"><input className={input} type="date" value={calendarDraft.date} onChange={(e) => setCalendarDraft({ ...calendarDraft, date: e.target.value })} /><input className={`${input} lg:col-span-2`} placeholder="Marketing task / content title" value={calendarDraft.title} onChange={(e) => setCalendarDraft({ ...calendarDraft, title: e.target.value })} /><select className={input} value={calendarDraft.channel} onChange={(e) => setCalendarDraft({ ...calendarDraft, channel: e.target.value })}>{CHANNELS.map((v) => <option key={v}>{v}</option>)}</select><button className={primary} onClick={addCalendar}>Add to calendar</button></div><div className="mt-3 flex flex-wrap gap-2"><select className={`${input} max-w-48`} value={calendarDraft.pillar} onChange={(e) => setCalendarDraft({ ...calendarDraft, pillar: e.target.value })}>{PILLARS.map((v) => <option key={v}>{v}</option>)}</select><button className={btn} onClick={() => setWorkspace((current) => ({ ...current, calendar: starterCalendar() }))}>Replace with 30-day starter plan</button></div></section>
        <section className={`${card} overflow-hidden`}>{workspace.calendar.length ? workspace.calendar.map((item) => <div key={item.id} className={`flex flex-col gap-3 border-b border-white/10 p-4 last:border-0 sm:flex-row sm:items-center ${item.done ? "opacity-50" : ""}`}><button aria-label="Toggle task" onClick={() => setWorkspace((current) => ({ ...current, calendar: current.calendar.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) }))} className={`h-6 w-6 shrink-0 rounded-lg border text-xs font-black ${item.done ? "border-lime-300 bg-lime-300 text-slate-950" : "border-white/20"}`}>{item.done ? "✓" : ""}</button><div className="w-32 text-xs text-slate-400">{dateLabel(item.date)}</div><div className="min-w-0 flex-1"><div className="font-bold">{item.title}</div><div className="text-xs text-slate-500">{item.channel} · {item.pillar}</div></div><button className={btn} onClick={() => setWorkspace((current) => ({ ...current, calendar: current.calendar.filter((row) => row.id !== item.id) }))}>Delete</button></div>) : <div className="p-10 text-center text-sm text-slate-400">Calendar is empty. Add a task or load the 30-day starter plan.</div>}</section>
      </div>}

      {tab === "Performance" && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Impressions", data?.summary.impressions || 0], ["Clicks", data?.summary.clicks || 0], ["Conversions", data?.summary.conversions || 0], ["Campaign revenue", inr(totalCampaignRevenue)]].map(([label, value]) => <div key={String(label)} className={`${card} p-5`}><div className="text-2xl font-black">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div><div className="text-xs uppercase tracking-wider text-slate-400">{label}</div></div>)}</div>
        <section className={`${card} overflow-x-auto`}><table className="w-full min-w-[900px] text-sm"><thead className="bg-white/[.03] text-left text-xs uppercase text-slate-400"><tr>{["Campaign", "Platform", "Status", "Impressions", "Clicks", "CTR", "Conversions", "Revenue", "Est. ROAS"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{(data?.campaigns || []).map((c) => <tr key={c.id} className="border-t border-white/10"><td className="px-4 py-3 font-bold">{c.headline}</td><td className="px-4 py-3">{c.platform}</td><td className="px-4 py-3">{c.status}</td><td className="px-4 py-3">{c.impressions}</td><td className="px-4 py-3">{c.clicks}</td><td className="px-4 py-3">{pct(c.clicks, c.impressions)}</td><td className="px-4 py-3">{c.conversions}</td><td className="px-4 py-3">{inr(c.revenueGeneratedInr)}</td><td className="px-4 py-3">{Number(c.estimatedRoas || 0).toFixed(2)}×</td></tr>)}</tbody></table></section>
        <section className={`${card} overflow-x-auto`}><div className="p-5"><h2 className="font-black">Recent store orders</h2><p className="text-xs text-slate-400">Revenue shown here comes from BharatShop order records, not manual cockpit entries.</p></div><table className="w-full min-w-[760px] text-sm"><thead className="bg-white/[.03] text-left text-xs uppercase text-slate-400"><tr>{["Order", "Product", "Date", "Payment", "Fulfillment", "Revenue", "Profit"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{(data?.orders || []).map((o) => <tr key={o.id} className="border-t border-white/10"><td className="px-4 py-3 font-bold">{o.orderNumber}</td><td className="px-4 py-3">{o.productTitle}</td><td className="px-4 py-3">{dateLabel(o.orderedAt)}</td><td className="px-4 py-3">{o.paymentStatus}</td><td className="px-4 py-3">{o.fulfillmentStatus}</td><td className="px-4 py-3">{inr(o.customerPaidInr)}</td><td className="px-4 py-3">{inr(o.netProfitInr)}</td></tr>)}</tbody></table></section>
      </div>}

      {tab === "Library" && <div className="space-y-5">
        <section className={`${card} p-5`}><div className="grid gap-3 lg:grid-cols-4"><input className={input} placeholder="Asset name" value={assetDraft.name} onChange={(e) => setAssetDraft({ ...assetDraft, name: e.target.value })} /><select className={input} value={assetDraft.category} onChange={(e) => setAssetDraft({ ...assetDraft, category: e.target.value })}>{["Creative", "Copy", "Prompt", "Organic Social", "SEO", "Email", "Research"].map((v) => <option key={v}>{v}</option>)}</select><textarea className={`${input} min-h-24 lg:col-span-2`} placeholder="Prompt, copy, hook, creative brief…" value={assetDraft.text} onChange={(e) => setAssetDraft({ ...assetDraft, text: e.target.value })} /></div><div className="mt-3 flex flex-wrap gap-2"><button className={primary} onClick={addAsset}>Save asset</button><button className={btn} onClick={() => void generateOrganicPack()} disabled={busy === "organic"}>{busy === "organic" ? "Generating…" : "Generate free organic pack"}</button></div></section>
        {organicPack?.posts?.length ? <section className={`${card} p-5`}><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Fresh organic pack</h2><p className="text-xs text-slate-400">{organicPack.count} catalog products · generated without a paid AI API.</p></div><button className={primary} onClick={saveOrganicPack}>Save all to library</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{organicPack.posts.slice(0, 6).map((post: any) => <div key={post.productId} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><b>{post.sku}</b><pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{post.instagram}</pre></div>)}</div></section> : null}
        <div className="grid gap-4 lg:grid-cols-2">{workspace.library.map((item) => <article key={item.id} className={`${card} p-5`}><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-lime-200">{item.category}</div><h3 className="mt-1 font-black">{item.name}</h3></div><div className="flex gap-2"><button className={btn} onClick={() => copy(item.text)}>Copy</button><button className={btn} onClick={() => setWorkspace((current) => ({ ...current, library: current.library.filter((row) => row.id !== item.id) }))}>Delete</button></div></div><pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs text-slate-300">{item.text}</pre></article>)}{!workspace.library.length && !organicPack && <div className={`${card} p-10 text-center text-sm text-slate-400`}>No saved marketing assets yet.</div>}</div>
      </div>}

      {tab === "Routines" && <div className="space-y-5"><section className={`${card} p-5`}><div className="flex gap-2"><input className={input} value={routineDraft} onChange={(e) => setRoutineDraft(e.target.value)} placeholder="Add operating routine" /><button className={primary} onClick={addRoutine}>Add</button></div></section><section className={`${card} overflow-hidden`}>{workspace.routines.map((item) => <div key={item.id} className={`flex items-center gap-3 border-b border-white/10 p-4 last:border-0 ${item.done ? "opacity-50" : ""}`}><button onClick={() => setWorkspace((current) => ({ ...current, routines: current.routines.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) }))} className={`h-6 w-6 rounded-lg border text-xs font-black ${item.done ? "border-lime-300 bg-lime-300 text-slate-950" : "border-white/20"}`}>{item.done ? "✓" : ""}</button><div className="flex-1"><div className="font-bold">{item.title}</div><div className="text-xs text-slate-500">{item.cadence}</div></div>{item.cadence === "Custom" && <button className={btn} onClick={() => setWorkspace((current) => ({ ...current, routines: current.routines.filter((row) => row.id !== item.id) }))}>Delete</button>}</div>)}</section></div>}

      {tab === "Review" && <div className="grid gap-5 lg:grid-cols-2"><section className={`${card} p-5`}><h2 className="font-black">Pillar scorecard</h2><p className="mt-1 text-xs text-slate-400">Rate the current marketing pillars from 1–5.</p><div className="mt-5 space-y-4">{PILLARS.map((pillar) => <div key={pillar} className="flex items-center justify-between gap-3"><span className="font-bold">{pillar}</span><div className="flex gap-1">{[1,2,3,4,5].map((score) => <button key={score} onClick={() => setWorkspace((current) => ({ ...current, pillarScores: { ...current.pillarScores, [scoreKey(pillar)]: score } }))} className={`h-9 w-9 rounded-lg border text-sm font-black ${workspace.pillarScores[scoreKey(pillar)] === score ? "border-lime-300 bg-lime-300 text-slate-950" : "border-white/10 bg-white/[.03]"}`}>{score}</button>)}</div></div>)}</div></section><section className={`${card} p-5`}><h2 className="font-black">Decisions & notes</h2><p className="mt-1 text-xs text-slate-400">Saved automatically with the rest of the cockpit workspace.</p><textarea className={`${input} mt-4 min-h-64`} value={workspace.reviewNotes[reviewKey] || ""} onChange={(e) => setWorkspace((current) => ({ ...current, reviewNotes: { ...current.reviewNotes, [reviewKey]: e.target.value } }))} placeholder="What shipped? What won? What failed? What changes next?" /></section></div>}

      {tab === "Connections" && <div className="space-y-5"><section className={`${card} p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Marketing integrations</h2><p className="text-xs text-slate-400">Checks use server-side credentials and never display tokens.</p></div><button className={primary} onClick={() => void verifyConnections()} disabled={busy === "connections"}>{busy === "connections" ? "Verifying…" : "Verify all"}</button></div></section><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{connections.map((connection) => <article key={connection.key} className={`${card} p-5`}><div className="flex items-start justify-between gap-3"><h3 className="font-black">{connection.label}</h3><span className={`rounded-full px-2 py-1 text-[11px] font-black ${connection.status === "VERIFIED" ? "bg-emerald-400/15 text-emerald-300" : connection.status === "BROKEN" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-200"}`}>{connection.status}</span></div>{connection.missing?.length ? <div className="mt-4 text-xs text-slate-400"><b className="text-slate-300">Missing server settings:</b><ul className="mt-2 list-disc pl-5">{connection.missing.map((name) => <li key={name}>{name}</li>)}</ul></div> : <p className="mt-4 text-xs text-slate-400">Configured. Run Verify all to test the provider connection.</p>}{connection.error && <p className="mt-3 rounded-lg bg-rose-400/10 p-2 text-xs text-rose-200">{connection.error}</p>}</article>)}</div><section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100"><b>Spend protection:</b> BharatShop remains zero-paid-API by default. Creating a Meta container is PAUSED-only and requires an explicit confirmation. Turning on spend is intentionally not exposed by this cockpit.</section></div>}

      {tab === "Agent" && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className={`${card} p-5`}><h2 className="font-black">Marketing Agent console</h2><p className="mt-1 text-xs text-slate-400">Uses the existing BharatShop Marketing Agent and your current store context.</p><textarea className={`${input} mt-4 min-h-40`} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Example: Build a zero-budget Instagram launch plan for the highest-margin published product, with 5 hooks, captions, CTA and measurement plan." /><div className="mt-3 flex flex-wrap gap-2"><button className={primary} onClick={() => void runAgent()} disabled={busy === "agent" || !objective.trim()}>{busy === "agent" ? "Thinking…" : "Run Marketing Agent"}</button>{agentResult !== null && <button className={btn} onClick={() => setWorkspace((current) => ({ ...current, library: [{ id: uid(), name: `Agent plan · ${objective.slice(0, 50)}`, category: "Research", text: JSON.stringify(agentResult, null, 2), createdAt: new Date().toISOString() }, ...current.library] }))}>Save result to library</button>}</div>{agentResult !== null && <pre className="mt-5 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-xs text-slate-200">{JSON.stringify(agentResult, null, 2)}</pre>}</section><section className={`${card} p-5`}><h2 className="font-black">Recent agent runs</h2><div className="mt-4 space-y-3">{workspace.agentRuns.map((run) => <button key={run.id} onClick={() => { setObjective(run.objective); setAgentResult(run.result); }} className="w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-left hover:border-lime-300/30"><div className="font-bold">{run.objective}</div><div className="mt-1 text-xs text-slate-500">{dateLabel(run.createdAt)}</div></button>)}{!workspace.agentRuns.length && <p className="text-sm text-slate-400">No saved runs yet.</p>}</div></section></div>}
    </div>

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}><div className={`${card} max-h-[90vh] w-full max-w-2xl overflow-auto p-5`}><div className="flex items-center justify-between gap-3"><h2 className="font-black">Edit campaign #{editing.id}</h2><button className={btn} onClick={() => setEditing(null)}>Close</button></div><div className="mt-4 space-y-3"><label className="text-xs text-slate-400">Headline<input className={`${input} mt-1`} value={editing.headline} onChange={(e) => setEditing({ ...editing, headline: e.target.value })} /></label><label className="text-xs text-slate-400">Body<textarea className={`${input} mt-1 min-h-28`} value={editing.bodyText} onChange={(e) => setEditing({ ...editing, bodyText: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">CTA<input className={`${input} mt-1`} value={editing.ctaText} onChange={(e) => setEditing({ ...editing, ctaText: e.target.value })} /></label><label className="text-xs text-slate-400">Budget/cap ₹<input className={`${input} mt-1`} type="number" min="0" value={editing.budgetInr} onChange={(e) => setEditing({ ...editing, budgetInr: e.target.value })} /></label></div><label className="text-xs text-slate-400">Audience<textarea className={`${input} mt-1 min-h-20`} value={editing.targetAudience} onChange={(e) => setEditing({ ...editing, targetAudience: e.target.value })} /></label><label className="text-xs text-slate-400">Schedule<input className={`${input} mt-1`} type="datetime-local" value={editing.scheduledAt ? editing.scheduledAt.slice(0, 16) : ""} onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label></div><div className="mt-5 flex justify-end gap-2"><button className={btn} onClick={() => setEditing(null)}>Cancel</button><button className={primary} onClick={() => void mutateCampaign("updateCampaign", editing.id, { headline: editing.headline, bodyText: editing.bodyText, ctaText: editing.ctaText, targetAudience: editing.targetAudience, budgetInr: editing.budgetInr, scheduledAt: editing.scheduledAt })}>Save campaign</button></div></div></div>}
  </main>;
}
