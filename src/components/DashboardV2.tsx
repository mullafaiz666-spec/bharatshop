"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  CircleAlert,
  Database,
  Eye,
  FileSearch,
  Gauge,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide-react";

type Tab = "overview" | "operations" | "team" | "approvals" | "activity" | "system";
type Message = { role: "user" | "assistant"; content: string };
type Agent = { id: string; name: string; icon: string; role: string; capabilities: string[] };
type Approval = { id: number; title: string; action_type: string; reason: string; risk_level: string; status: string; created_at: string };
type CommandResult = { action?: string; label?: string; ok?: boolean; httpStatus?: number; data?: any; error?: string; executedAt?: string };

type CommandStatus = {
  status?: string;
  operator?: { id: number; name: string; role: string };
  automationConfigured?: boolean;
  services?: Record<string, any>;
  actions?: Array<{ id: string; label: string }>;
  policy?: string;
  error?: string;
};

const AGENTS: Agent[] = [
  { id: "ceo", name: "AI CEO", icon: "👔", role: "Executive strategy, priorities, economics and coordination", capabilities: ["business review", "profitability", "risk gates", "delegation"] },
  { id: "discovery", name: "Product Research", icon: "🔎", role: "Find real product opportunities from public and supplier evidence", capabilities: ["trend research", "market evidence", "opportunity ranking"] },
  { id: "verification", name: "Source Verification", icon: "🛡️", role: "Validate supplier price, stock, shipping and fulfilment eligibility", capabilities: ["live evidence", "landed cost", "margin gate"] },
  { id: "media", name: "Image & Media", icon: "🖼️", role: "Maintain truthful product galleries and real visual assets", capabilities: ["media verification", "gallery repair", "image quality"] },
  { id: "fashion", name: "BharatDrip Fashion", icon: "👕", role: "Original made-to-order streetwear and real-human editorial presentation", capabilities: ["design system", "Qikink mapping", "photoreal media"] },
  { id: "listing", name: "Listing & Merchandising", icon: "📝", role: "Create customer-safe, competitive product listings", capabilities: ["titles", "copy", "pricing presentation", "publication gate"] },
  { id: "marketing", name: "Marketing", icon: "📈", role: "Build organic and channel-ready growth campaigns", capabilities: ["creative briefs", "audiences", "content plans"] },
  { id: "advertising", name: "Advertising", icon: "📣", role: "Prepare Meta and Google campaigns within contribution-margin limits", capabilities: ["CPA guard", "ROAS", "paused campaigns"] },
  { id: "orders", name: "Order Re-check", icon: "🔄", role: "Re-verify economics and availability before fulfilment", capabilities: ["price", "stock", "shipping", "margin"] },
  { id: "tracking", name: "Fulfilment & Tracking", icon: "🚚", role: "Coordinate production, carrier status and customer delivery truth", capabilities: ["tracking", "exceptions", "delivery lifecycle"] },
  { id: "learning", name: "Learning & Analytics", icon: "🧠", role: "Learn from real operational outcomes and external market context", capabilities: ["evidence synthesis", "RTO/returns", "profit patterns"] },
  { id: "automation", name: "Automation Engineering", icon: "⚙️", role: "Design bounded, auditable production workflows", capabilities: ["workflow reliability", "idempotency", "failure handling"] },
  { id: "web-design", name: "Web & Conversion", icon: "🖥️", role: "Improve mobile storefront UX without breaking commerce contracts", capabilities: ["responsive UX", "accessibility", "conversion"] },
];

const NAV: Array<{ id: Tab; label: string; icon: any }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "operations", label: "Operations", icon: Zap },
  { id: "team", label: "AI Team", icon: Users },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "system", label: "System", icon: Settings },
];

const OPERATIONS = [
  { id: "fashion-fronts", title: "Generate real front photos", description: "Upgrade the next BharatDrip cards to real-human streetwear photography.", icon: ImageIcon, accent: "orange" },
  { id: "fashion-backs", title: "Generate real back photos", description: "Generate real-human back-view editorial images for BharatDrip products.", icon: Eye, accent: "orange" },
  { id: "google-refresh", title: "Refresh Google intelligence", description: "Pull fresh India ecommerce, fashion and consumer-market evidence.", icon: Globe2, accent: "blue" },
  { id: "product-research", title: "Research new products", description: "Run the evidence-gated product discovery workflow.", icon: Search, accent: "blue" },
  { id: "catalog-repair", title: "Repair catalog", description: "Re-check staged/published media and verification gates.", icon: PackageSearch, accent: "emerald" },
  { id: "ceo-cycle", title: "Run CEO cycle", description: "Inspect pipeline candidates and release only evidence-backed items.", icon: Bot, accent: "emerald" },
  { id: "learning-review", title: "Run learning review", description: "Analyze operational outcomes plus current Google evidence.", icon: Sparkles, accent: "violet" },
];

const panel = "rounded-2xl border border-slate-800 bg-slate-900/70";
const btn = "rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition";

function statusTone(status: unknown) {
  const s = String(status || "UNKNOWN").toUpperCase();
  if (["READY", "SUCCESS", "LIVE", "COMPLETED", "REFRESHED", "FRESH", "PHOTOREAL_READY"].some(x => s.includes(x))) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (["PENDING", "PARTIAL", "WARNING", "DEGRADED", "UPGRADE"].some(x => s.includes(x))) return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  if (["ERROR", "FAILED", "BLOCKED", "MISSING", "UNAUTHORIZED"].some(x => s.includes(x))) return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  return "text-slate-300 bg-slate-800 border-slate-700";
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function DashboardV2() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>(null);
  const [commandStatus, setCommandStatus] = useState<CommandStatus | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("ceo");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [audit, setAudit] = useState<{ records: any[]; recentActivity: any[]; blockers: any[] }>({ records: [], recentActivity: [], blockers: [] });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [overviewRes, approvalRes, commandRes] = await Promise.all([
        fetch("/api/overview?limit=60", { cache: "no-store" }).catch(() => null),
        fetch("/api/ceo-approvals", { cache: "no-store" }).catch(() => null),
        fetch("/api/admin/command-centre", { cache: "no-store" }).catch(() => null),
      ]);
      const overview = overviewRes?.ok ? await overviewRes.json().catch(() => null) : null;
      const approvalData = approvalRes?.ok ? await approvalRes.json().catch(() => null) : null;
      const command = commandRes?.ok ? await commandRes.json().catch(() => null) : commandRes ? await commandRes.json().catch(() => null) : null;
      if (overview) setData(overview);
      setApprovals(Array.isArray(approvalData?.approvals) ? approvalData.approvals.filter((x: Approval) => x.status === "PENDING") : []);
      if (command) setCommandStatus(command);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadAudit = useCallback(async (agent: Agent) => {
    const r = await fetch(`/api/agent-audit?agent=${encodeURIComponent(agent.name)}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    setAudit({ records: d?.records || [], recentActivity: d?.recentActivity || [], blockers: d?.blockers || [] });
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const agent = useMemo(() => AGENTS.find(a => a.id === selectedAgent) || AGENTS[0], [selectedAgent]);
  useEffect(() => { void loadAudit(agent); }, [agent, loadAudit]);

  const k = data?.kpis || {};
  const pipeline = [
    ["Staged / draft", k.stagedProductsCount ?? 0],
    ["Source verified", k.sourceVerifiedProductsCount ?? 0],
    ["CEO pending", k.ceoPendingProductsCount ?? 0],
    ["CEO approved", k.ceoApprovedProductsCount ?? 0],
    ["Market research", k.marketResearchPendingProductsCount ?? 0],
    ["Published", k.publishedProductsCount ?? 0],
  ];

  const currentMessages = messages[selectedAgent] || [
    { role: "assistant" as const, content: `${agent.name} is connected to the current BharatShop operating context. Ask for a status, root cause, audit, or next action.` },
  ];

  async function runAction(action: string) {
    if (running) return;
    setRunning(action);
    setLastResult(null);
    const op = OPERATIONS.find(x => x.id === action);
    setNotice(op ? `${op.title} is running…` : "Command is running…");
    try {
      const r = await fetch("/api/admin/command-centre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      setLastResult(result);
      if (r.ok && result.ok !== false) {
        setNotice(`${result.label || op?.title || "Command"} completed.`);
      } else {
        setNotice(`${result.label || op?.title || "Command"} returned a blocker. See the result below.`);
      }
      await load(true);
    } catch (error) {
      setLastResult({ action, error: error instanceof Error ? error.message : "Command failed" });
      setNotice("Command could not reach the live service. No unverified success was recorded.");
    } finally {
      setRunning(null);
    }
  }

  async function decide(id: number, action: "approve" | "reject") {
    const r = await fetch("/api/ceo-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const d = await r.json().catch(() => ({}));
    setNotice(action === "approve" ? (d.execution === "EXECUTED" ? "Approved and executed." : d.error || "Approval recorded.") : "Approval rejected.");
    await load(true);
  }

  async function askAgent(text?: string) {
    const q = String(text ?? question).trim();
    if (!q || chatBusy) return;
    const prior = currentMessages;
    const next = [...prior, { role: "user" as const, content: q }];
    setMessages(v => ({ ...v, [selectedAgent]: next }));
    setQuestion("");
    setChatBusy(true);
    try {
      const r = await fetch("/api/ceo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          messages: next,
          context: {
            kpis: data?.kpis,
            products: data?.products,
            orders: data?.orders?.slice?.(0, 20),
            activityLogs: data?.activityLogs,
            categoryDistribution: data?.categoryDistribution,
            truthPolicy: data?.truthPolicy,
            selectedAgent: agent.name,
            agentRole: agent.role,
            agentCapabilities: agent.capabilities,
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      setMessages(v => ({ ...v, [selectedAgent]: [...next, { role: "assistant", content: d.reply || d.error || "No answer was returned." }] }));
      await Promise.all([load(true), loadAudit(agent)]);
    } catch {
      setMessages(v => ({ ...v, [selectedAgent]: [...next, { role: "assistant", content: "The live service could not be reached. I did not claim or record a completed action." }] }));
    } finally {
      setChatBusy(false);
    }
  }

  async function toggleAutopilot() {
    const enabled = !Boolean(data?.user?.aiAutoPilotEnabled);
    const r = await fetch("/api/overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiAutoPilotEnabled: enabled }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setNotice(enabled ? "Autopilot enabled for approved automation paths." : "Autopilot paused for manual review.");
    else setNotice(d.error || "Autopilot setting could not be changed.");
    await load(true);
  }

  if (loading) {
    return <main className="min-h-screen bg-[#070b12] text-slate-100 flex items-center justify-center"><div className="text-center"><RefreshCw className="animate-spin mx-auto text-orange-400"/><p className="text-sm text-slate-400 mt-3">Loading live operations…</p></div></main>;
  }

  return <main className="min-h-screen bg-[#070b12] text-slate-100">
    <div className="max-w-[1700px] mx-auto p-3 md:p-6">
      <header className="mb-4 md:mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] md:text-xs font-mono tracking-[.22em] text-orange-400">BHARATSHOP // OPERATIONS</div>
          <div className="flex flex-wrap items-center gap-3 mt-1"><h1 className="text-2xl md:text-4xl font-black">Command Centre</h1><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(commandStatus?.status || "READY")}`}>{commandStatus?.status || "LIVE"}</span></div>
          <p className="text-xs md:text-sm text-slate-500 mt-2">A systematic control surface for catalog, agents, evidence, approvals, media and operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} disabled={refreshing} className={btn}><span className="flex items-center gap-2"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "Refreshing" : "Refresh live data"}</span></button>
          <a href="/" target="_blank" rel="noreferrer" className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-slate-950 flex items-center gap-2"><ShoppingBag size={16}/>Open Storefront</a>
        </div>
      </header>

      {notice && <div className="mb-4 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-sm text-orange-100 flex gap-2 items-start"><CircleAlert size={16} className="mt-0.5 shrink-0"/><span>{notice}</span></div>}

      <nav className={`${panel} mb-5 p-2 overflow-x-auto`}><div className="flex min-w-max md:min-w-0 md:grid md:grid-cols-6 gap-1">{NAV.map(item => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${active ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}><Icon size={16}/>{item.label}</button>; })}</div></nav>

      {tab === "overview" && <div className="space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            ["Published", k.publishedProductsCount ?? 0, "customer-visible"],
            ["Total records", k.totalProductRecordsCount ?? 0, "database products"],
            ["In pipeline", k.inPipelineProductsCount ?? 0, "not yet live"],
            ["Orders", data?.orders?.length ?? 0, "order records"],
            ["Pending orders", k.pendingOrdersCount ?? 0, "need attention"],
            ["Approvals", approvals.length, "human decisions"],
          ].map(([label, value, sub]) => <button key={String(label)} onClick={() => label === "Approvals" ? setTab("approvals") : label === "In pipeline" ? setTab("operations") : undefined} className={`${panel} p-4 text-left hover:border-slate-600 transition`}><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className="text-2xl md:text-3xl font-black mt-1">{value}</div><div className="text-[10px] text-slate-600 mt-1">{sub}</div></button>)}
        </section>

        <div className="grid xl:grid-cols-[1.25fr_.75fr] gap-5">
          <section className={`${panel} overflow-hidden`}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between"><div><h2 className="font-bold flex items-center gap-2"><Gauge size={17} className="text-orange-400"/>Catalog pipeline</h2><p className="text-xs text-slate-500 mt-1">Every stage is shown separately; no total is presented as published inventory.</p></div><button onClick={() => setTab("operations")} className="text-xs text-orange-300 hover:text-orange-200">Open controls →</button></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">{pipeline.map(([label, value], index) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex justify-between items-center"><span className="text-xs text-slate-400">{index + 1}. {label}</span><span className="text-xl font-black">{value}</span></div><div className="h-1.5 rounded-full bg-slate-800 mt-3 overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${Math.min(100, Number(value) > 0 ? 18 + Math.min(82, Number(value)) : 0)}%` }}/></div></div>)}</div>
          </section>

          <section className={`${panel} p-4`}>
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold flex items-center gap-2"><ImageIcon size={17} className="text-orange-400"/>BharatDrip photo upgrade</h2><p className="text-xs text-slate-500 mt-1">Current generator: {commandStatus?.services?.fashionStudio?.provider || "checking"}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] ${statusTone(commandStatus?.services?.fashionStudio?.status)}`}>{commandStatus?.services?.fashionStudio?.status || "UNKNOWN"}</span></div>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 mt-4"><div className="text-3xl font-black">{commandStatus?.services?.fashionStudio?.photorealCurrentShots ?? 0}</div><div className="text-xs text-slate-500 mt-1">current v4 photoreal cached shots</div></div>
            <button onClick={() => { setTab("operations"); void runAction("fashion-fronts"); }} disabled={Boolean(running)} className="w-full mt-3 rounded-xl bg-orange-500 text-slate-950 font-black py-3 flex items-center justify-center gap-2 disabled:opacity-40"><Play size={16}/>{running === "fashion-fronts" ? "Generating…" : "Generate real front photos"}</button>
          </section>
        </div>

        <section className={`${panel} p-4`}><div className="flex items-center justify-between"><div><h2 className="font-bold">Recent operational activity</h2><p className="text-xs text-slate-500">Latest audited work from production.</p></div><button onClick={() => setTab("activity")} className="text-xs text-orange-300">View all →</button></div><div className="mt-3 divide-y divide-slate-800">{(data?.activityLogs || []).slice(0, 6).map((x: any, i: number) => <div key={x.id || i} className="py-3 flex gap-3"><div className={`mt-1 h-2 w-2 rounded-full ${String(x.status).toUpperCase() === "SUCCESS" ? "bg-emerald-400" : "bg-amber-400"}`}/><div className="min-w-0"><div className="text-xs text-slate-500">{x.agentName} · {x.actionType}</div><p className="text-sm mt-1 text-slate-300">{x.message}</p></div></div>)}</div></section>
      </div>}

      {tab === "operations" && <div className="space-y-5">
        <section className={`${panel} p-4 md:p-5`}><div className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h2 className="text-xl font-black">Operational controls</h2><p className="text-sm text-slate-500 mt-1">Every card below calls a real existing BharatShop workflow. No decorative buttons.</p></div><div className={`rounded-full border px-3 py-1.5 text-xs ${commandStatus?.automationConfigured ? statusTone("READY") : statusTone("BLOCKED")}`}>{commandStatus?.automationConfigured ? "Automation token configured" : "Automation token missing"}</div></div></section>
        <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{OPERATIONS.map(op => { const Icon = op.icon; const active = running === op.id; return <article key={op.id} className={`${panel} p-5 flex flex-col min-h-[210px]`}><div className="flex items-start justify-between"><div className="h-11 w-11 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center"><Icon size={20} className="text-orange-400"/></div>{active && <RefreshCw size={16} className="animate-spin text-orange-400"/>}</div><h3 className="font-bold text-lg mt-4">{op.title}</h3><p className="text-sm text-slate-500 mt-2 flex-1">{op.description}</p><button onClick={() => void runAction(op.id)} disabled={Boolean(running)} className="mt-4 rounded-xl bg-slate-950 border border-slate-700 hover:border-orange-500/50 px-4 py-3 text-sm font-bold flex items-center justify-between disabled:opacity-40"><span>{active ? "Running…" : "Run now"}</span><Play size={15}/></button></article>; })}</section>
        {lastResult && <section className={`${panel} overflow-hidden`}><div className="p-4 border-b border-slate-800 flex items-center gap-2"><Terminal size={16} className="text-orange-400"/><h2 className="font-bold">Last command result</h2><span className={`ml-auto rounded-full border px-2 py-1 text-[10px] ${statusTone(lastResult.ok === false || lastResult.error ? "ERROR" : lastResult.data?.status || "SUCCESS")}`}>{lastResult.ok === false || lastResult.error ? "BLOCKED / ERROR" : lastResult.data?.status || "COMPLETED"}</span></div><pre className="p-4 text-[11px] leading-5 text-slate-400 overflow-auto max-h-[440px] whitespace-pre-wrap">{pretty(lastResult)}</pre></section>}
      </div>}

      {tab === "team" && <div className="grid xl:grid-cols-[360px_1fr] gap-5 items-start">
        <aside className={`${panel} overflow-hidden`}><div className="p-4 border-b border-slate-800"><h2 className="font-bold flex items-center gap-2"><Bot size={17} className="text-orange-400"/>AI specialist team</h2><p className="text-xs text-slate-500 mt-1">Select a specialist to inspect or question.</p></div><div className="p-2 max-h-[780px] overflow-auto">{AGENTS.map(a => <button key={a.id} onClick={() => setSelectedAgent(a.id)} className={`w-full text-left rounded-xl p-3 mb-1 border transition ${selectedAgent === a.id ? "bg-orange-500/10 border-orange-500/25" : "border-transparent hover:bg-slate-800"}`}><div className="flex gap-3"><span className="text-xl">{a.icon}</span><div><div className="font-semibold text-sm">{a.name}</div><div className="text-[11px] leading-4 text-slate-500 mt-1">{a.role}</div></div></div></button>)}</div></aside>
        <section className="space-y-5">
          <div className={`${panel} p-5`}><div className="flex gap-4 items-start"><div className="text-3xl">{agent.icon}</div><div className="flex-1"><h2 className="text-xl font-black">{agent.name}</h2><p className="text-sm text-slate-500 mt-1">{agent.role}</p><div className="flex flex-wrap gap-2 mt-3">{agent.capabilities.map(c => <span key={c} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-400">{c}</span>)}</div></div></div></div>
          <div className={`${panel} overflow-hidden`}><div className="p-4 border-b border-slate-800 flex items-center justify-between"><div><h3 className="font-bold">Operator console</h3><p className="text-xs text-slate-500">Grounded in current overview, products, orders and activity.</p></div><button onClick={() => void askAgent("Audit this area against live evidence. State what is working, what is broken, business impact, and the next concrete action. Do not claim an action ran without a receipt.")} disabled={chatBusy} className={btn}><span className="flex items-center gap-2"><FileSearch size={14}/>Audit area</span></button></div><div className="p-4 space-y-3 max-h-[520px] overflow-auto">{currentMessages.map((m, i) => <div key={i} className={`max-w-[92%] rounded-2xl p-4 text-sm leading-6 whitespace-pre-wrap ${m.role === "assistant" ? "bg-slate-950 border border-slate-800 mr-auto" : "bg-orange-500 text-slate-950 ml-auto"}`}>{m.content}</div>)}{chatBusy && <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 text-sm text-slate-400">Analyzing live context…</div>}</div><div className="p-4 border-t border-slate-800"><div className="flex flex-wrap gap-2 mb-3">{["What is broken?", "What should happen next?", "Show the evidence", "What needs human approval?"].map(x => <button key={x} onClick={() => void askAgent(x)} disabled={chatBusy} className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 hover:text-white">{x}</button>)}</div><div className="flex gap-2"><input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void askAgent(); }} placeholder={`Ask ${agent.name}…`} className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-sm outline-none focus:border-orange-500"/><button onClick={() => void askAgent()} disabled={!question.trim() || chatBusy} className="rounded-xl bg-orange-500 text-slate-950 px-4 disabled:opacity-40"><MessageSquare size={17}/></button></div></div></div>
          <div className="grid lg:grid-cols-2 gap-4"><div className={`${panel} p-4`}><h3 className="font-bold text-sm">Current blockers</h3><div className="mt-3 space-y-2">{audit.blockers.length ? audit.blockers.slice(0, 8).map((x: any, i: number) => <div key={x.id || i} className="rounded-xl bg-slate-950 border border-rose-500/10 p-3 text-xs text-slate-400">{x.summary || x.message || pretty(x)}</div>) : <div className="text-sm text-slate-600">No blockers returned for this specialist.</div>}</div></div><div className={`${panel} p-4`}><h3 className="font-bold text-sm">Recent audit records</h3><div className="mt-3 space-y-2">{audit.records.length ? audit.records.slice(0, 8).map((x: any, i: number) => <div key={x.id || i} className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="text-[10px] text-slate-500">{x.event_type || x.eventType} · {x.status}</div><div className="text-xs text-slate-300 mt-1">{x.summary}</div></div>) : <div className="text-sm text-slate-600">No audit records yet.</div>}</div></div></div>
        </section>
      </div>}

      {tab === "approvals" && <section className={`${panel} overflow-hidden`}><div className="p-5 border-b border-slate-800 flex items-center justify-between"><div><h2 className="text-xl font-black flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-400"/>Approval desk</h2><p className="text-sm text-slate-500 mt-1">Consequential actions stop here until a human decides.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs">{approvals.length} pending</span></div><div className="p-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">{approvals.length === 0 ? <div className="col-span-full py-16 text-center text-slate-500"><Check className="mx-auto mb-3 text-emerald-400"/><div>No pending approvals.</div></div> : approvals.map(a => <article key={a.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{a.title}</h3><div className="text-[10px] text-orange-300 uppercase mt-1">{a.risk_level} · {a.action_type}</div></div><span className="text-[10px] text-slate-600">#{a.id}</span></div><p className="text-sm text-slate-500 mt-3">{a.reason}</p><div className="grid grid-cols-2 gap-2 mt-4"><button onClick={() => void decide(a.id, "reject")} className="rounded-xl border border-slate-700 py-2.5 text-sm font-bold flex items-center justify-center gap-2"><X size={15}/>Reject</button><button onClick={() => void decide(a.id, "approve")} className="rounded-xl bg-emerald-500 text-slate-950 py-2.5 text-sm font-black flex items-center justify-center gap-2"><Check size={15}/>Approve</button></div></article>)}</div></section>}

      {tab === "activity" && <section className={`${panel} overflow-hidden`}><div className="p-5 border-b border-slate-800"><h2 className="text-xl font-black flex items-center gap-2"><Activity size={19} className="text-orange-400"/>Activity ledger</h2><p className="text-sm text-slate-500 mt-1">Latest production agent activity from PostgreSQL.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-950 text-[10px] uppercase text-slate-500"><tr><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Agent</th><th className="text-left px-4 py-3">Action</th><th className="text-left px-4 py-3">Message</th><th className="text-left px-4 py-3">Time</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.activityLogs || []).map((x: any, i: number) => <tr key={x.id || i} className="hover:bg-slate-800/30"><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] ${statusTone(x.status)}`}>{x.status || "INFO"}</span></td><td className="px-4 py-3 text-slate-300">{x.agentName}</td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{x.actionType}</td><td className="px-4 py-3 text-slate-400 max-w-xl">{x.message}</td><td className="px-4 py-3 text-slate-600 text-xs">{x.createdAt ? new Date(x.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></section>}

      {tab === "system" && <div className="space-y-5">
        <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Object.entries(commandStatus?.services || {}).map(([name, service]) => <article key={name} className={`${panel} p-4`}><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wider text-slate-500">{name.replace(/([A-Z])/g, " $1")}</div><div className="font-bold mt-1">{service?.provider || service?.suite || "BharatShop service"}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] ${statusTone(service?.status)}`}>{service?.status || "UNKNOWN"}</span></div><div className="mt-3 text-xs text-slate-500 space-y-1">{service?.styleVersion && <div>Style: <span className="text-slate-300">{service.styleVersion}</span></div>}{service?.photorealCurrentShots !== undefined && <div>Photoreal shots: <span className="text-slate-300">{service.photorealCurrentShots}</span></div>}{service?.evidenceCount !== undefined && <div>Evidence items: <span className="text-slate-300">{service.evidenceCount}</span></div>}{service?.operationalAgents !== undefined && <div>Operational agents: <span className="text-slate-300">{service.operationalAgents}</span></div>}{service?.error && <div className="text-rose-300">{service.error}</div>}</div></article>)}</section>
        <section className={`${panel} p-5 grid lg:grid-cols-[1fr_auto] gap-4 items-center`}><div><h2 className="font-bold flex items-center gap-2"><Settings size={17} className="text-orange-400"/>Automation mode</h2><p className="text-sm text-slate-500 mt-1">Autopilot only applies to already-approved automation paths. Human gates remain for spend, purchases, refunds, credentials and destructive actions.</p></div><button onClick={() => void toggleAutopilot()} className={`rounded-xl px-5 py-3 font-black text-sm ${data?.user?.aiAutoPilotEnabled ? "bg-emerald-500 text-slate-950" : "bg-slate-950 border border-slate-700 text-slate-300"}`}>{data?.user?.aiAutoPilotEnabled ? "Autopilot ON" : "Autopilot OFF"}</button></section>
        <section className={`${panel} p-5`}><h2 className="font-bold flex items-center gap-2"><Database size={17} className="text-orange-400"/>Truth & safety policy</h2><p className="text-sm text-slate-500 mt-2">{commandStatus?.policy || "Production PostgreSQL is source of truth. Missing evidence means hold, not guess."}</p><div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">{["No destructive DB reset", "No fake price/stock/performance", "Paid spend stays approval-gated", "Supplier purchase stays approval-gated"].map(x => <div key={x} className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex gap-2"><Check size={14} className="text-emerald-400 shrink-0"/>{x}</div>)}</div></section>
        {lastResult && <section className={`${panel} overflow-hidden`}><div className="p-4 border-b border-slate-800 flex items-center gap-2"><Terminal size={16}/><h2 className="font-bold">Last command receipt</h2></div><pre className="p-4 max-h-[420px] overflow-auto text-[11px] text-slate-400 whitespace-pre-wrap">{pretty(lastResult)}</pre></section>}
      </div>}
    </div>
  </main>;
}
