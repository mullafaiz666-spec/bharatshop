"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  ImageIcon,
  Network,
  Play,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Target,
  Users,
  WandSparkles,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

type Agent = {
  id: string;
  name: string;
  mission: string;
  tools: string[];
  requiredInputs: string[];
  successCriteria: string[];
  approvalBoundary: string;
};

type Goal = { id: string; title: string; objective: string; status: string; priority: number; updated_at: string };
type ToolReceipt = { tool?: string; status?: string; durationMs?: number; auditId?: number | null };
type WorkItem = {
  id: string;
  goal_id: string | null;
  agent_id: string;
  title: string;
  objective: string;
  status: string;
  priority: number;
  run_id?: string | null;
  output?: { reply?: string; error?: string; toolExecutions?: ToolReceipt[] };
  created_at: string;
  updated_at: string;
};
type SharedEvent = { id: number; goal_id?: string | null; work_item_id?: string | null; agent_id: string; event_type: string; status: string; summary: string; created_at: string };
type Latest = { agent_id: string; id: string; title: string; status: string; updated_at: string };
type Count = { status: string; count: number };
type CompanyData = {
  status: string;
  operator?: { id: number; name: string; role: string };
  agents: Agent[];
  goals: Goal[];
  workItems: WorkItem[];
  sharedEvents: SharedEvent[];
  latestByAgent: Latest[];
  workCounts: Count[];
  pendingApprovals?: unknown[];
  policy?: { sourceOfTruth?: string; evidenceRule?: string; approvalGates?: string[]; sharedData?: string };
  inspectedAt?: string;
};
type ServiceData = {
  services?: Record<string, { status?: string; [key: string]: unknown }>;
  actions?: Array<{ id: string; label: string }>;
  automationConfigured?: boolean;
};
type HealthItem = { ready?: boolean; configured?: boolean; reason?: string; provider?: string; model?: string };
type HealthData = {
  ok?: boolean;
  models?: { text?: string; vision?: string };
  readiness?: { postgres?: HealthItem; ai?: HealthItem; vision?: HealthItem; searxng?: HealthItem };
};
type AgentHealthData = {
  allOperational?: boolean;
  summary?: { total?: number; ready?: number; blocked?: string[]; allReady?: boolean };
};
type FashionProduct = { id: number; title: string; imageUrl?: string; status?: string; sellingPriceInr?: number; marginPct?: number };
type FashionData = { products?: FashionProduct[]; creative?: { provider?: string; finalModel?: string; batchModel?: string; mode?: string; note?: string } };
type Metric = { label: string; value: number; Icon: LucideIcon };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };

const panel = "rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,31,.96),rgba(7,10,17,.96))] shadow-[0_24px_80px_rgba(0,0,0,.28)]";
const button = "rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-2.5 text-sm font-bold transition hover:border-white/25 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40";

function tone(status: unknown) {
  const value = String(status || "IDLE").toUpperCase();
  if (["READY", "SUCCESS", "COMPLETED", "LIVE", "CONNECTED", "OPERATIONAL"].some((x) => value.includes(x))) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (["RUNNING", "QUEUED", "PENDING", "APPROVAL", "PARTIAL", "EXTERNAL"].some((x) => value.includes(x))) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (["FAILED", "BLOCKED", "ERROR", "HOLD"].some((x) => value.includes(x))) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-slate-700 bg-slate-900 text-slate-400";
}

function timeAgo(value?: string) {
  if (!value) return "never";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "now";
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function IntegrationCard({ icon: Icon, title, status, detail, href, hrefLabel }: { icon: LucideIcon; title: string; status: string; detail: string; href?: string; hrefLabel?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20"><Icon size={17} className="text-cyan-300"/></span><div><div className="text-sm font-black text-white">{title}</div><div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${tone(status)}`}>{status}</div></div></div>
      {href && <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"><ExternalLink size={14}/></a>}
    </div>
    <p className="mt-3 min-h-10 text-xs leading-5 text-slate-400">{detail}</p>
    {href && hrefLabel && <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="mt-3 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-300 hover:text-cyan-200">{hrefLabel}<ExternalLink size={12}/></a>}
  </div>;
}

export default function CommandCentreV3() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [services, setServices] = useState<ServiceData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [agentHealth, setAgentHealth] = useState<AgentHealthData | null>(null);
  const [fashion, setFashion] = useState<FashionData | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [selectedId, setSelectedId] = useState("ceo");
  const [objective, setObjective] = useState("");
  const [growthObjective, setGrowthObjective] = useState("Grow BharatShop profitably using verified products, strong organic demand, low operating cost and strict contribution-margin protection.");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [lastRun, setLastRun] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [companyResponse, serviceResponse, healthResponse, agentHealthResponse, fashionResponse] = await Promise.all([
        fetch("/api/agents/company", { cache: "no-store" }),
        fetch("/api/admin/command-centre", { cache: "no-store" }).catch(() => null),
        fetch("/api/health?deep=1", { cache: "no-store" }).catch(() => null),
        fetch("/api/health/agents", { cache: "no-store" }).catch(() => null),
        fetch("/api/admin/fashion-agent", { cache: "no-store" }).catch(() => null),
      ]);
      const company = await companyResponse.json().catch(() => null);
      if (companyResponse.ok && company) setData(company as CompanyData);
      else if (!quiet) setNotice(String(company?.error || "Shared company state could not be loaded."));
      if (serviceResponse?.ok) setServices(await serviceResponse.json().catch(() => null) as ServiceData | null);
      if (healthResponse) setHealth(await healthResponse.json().catch(() => null) as HealthData | null);
      if (agentHealthResponse) setAgentHealth(await agentHealthResponse.json().catch(() => null) as AgentHealthData | null);
      if (fashionResponse?.ok) setFashion(await fashionResponse.json().catch(() => null) as FashionData | null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 20_000);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => { clearInterval(timer); window.removeEventListener("beforeinstallprompt", onInstall); };
  }, [load]);

  const agent = useMemo(() => data?.agents?.find((item) => item.id === selectedId) || data?.agents?.[0], [data, selectedId]);
  const latestMap = useMemo(() => new Map((data?.latestByAgent || []).map((item) => [item.agent_id, item])), [data]);
  const counts = useMemo(() => new Map((data?.workCounts || []).map((item) => [String(item.status).toUpperCase(), Number(item.count || 0)])), [data]);
  const activeGoal = data?.goals?.find((goal) => goal.status === "ACTIVE") || data?.goals?.[0];
  const agentWork = useMemo(() => (data?.workItems || []).filter((item) => item.agent_id === selectedId).slice(0, 12), [data, selectedId]);
  const agentEvents = useMemo(() => (data?.sharedEvents || []).filter((item) => item.agent_id === selectedId).slice(0, 10), [data, selectedId]);
  const pendingApprovals = Array.isArray(data?.pendingApprovals) ? data.pendingApprovals.length : 0;
  const catalogMedia = useMemo(() => (fashion?.products || []).filter((product) => Boolean(product.imageUrl)).slice(0, 8), [fashion]);
  const metrics: Metric[] = [
    { label: "Agents ready", value: Number(agentHealth?.summary?.ready || 0), Icon: Users },
    { label: "Active goals", value: data?.goals?.filter((x) => x.status === "ACTIVE").length || 0, Icon: Target },
    { label: "Queued", value: counts.get("QUEUED") || 0, Icon: Clock3 },
    { label: "Running", value: counts.get("RUNNING") || 0, Icon: Zap },
    { label: "Holds / blocked", value: (counts.get("HOLD") || 0) + (counts.get("BLOCKED") || 0) + (counts.get("FAILED") || 0), Icon: CircleAlert },
    { label: "Approvals", value: pendingApprovals, Icon: ShieldCheck },
  ];

  async function installApp() {
    if (!installPrompt) {
      setNotice("Browser install prompt is not available right now. Use Edge/Chrome Install App from the address bar or browser menu.");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice?.catch(() => null);
    setInstallPrompt(null);
  }

  async function companyCommand(payload: Record<string, unknown>, key: string) {
    if (busy) return null;
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch("/api/agents/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      setLastRun(result);
      if (!response.ok || result.ok === false) setNotice(String(result.error || `Command returned HTTP ${response.status}.`));
      else if (result.status === "QUEUED") setNotice(String(result.message || "Task queued; waiting for worker execution."));
      else if (key === "growth") setNotice("Growth cycle created: CEO direction ran and specialist work was queued on the shared company bus.");
      else if (key === "queue") setNotice(`Processed ${Number(result.claimed || 0)} queued specialist task(s).`);
      else setNotice(`${agent?.name || "Agent"} completed/attempted a real runtime cycle; the receipt is stored below.`);
      await load(true);
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Command failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runSelectedAgent() {
    const q = objective.trim();
    if (!q || !agent) return;
    setObjective("");
    await companyCommand({ action: "run_agent", agentId: agent.id, objective: q, goalId: activeGoal?.id || undefined }, `agent:${agent.id}`);
  }

  async function runSystemAction(action: string) {
    if (busy) return;
    setBusy(`system:${action}`);
    setNotice("");
    try {
      const response = await fetch("/api/admin/command-centre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json().catch(() => ({}));
      setLastRun(result);
      setNotice(response.ok && result.ok !== false ? `${String(result.label || action)} completed.` : String(result.error || `${String(result.label || action)} returned a blocker.`));
      await load(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "System command failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return <main className="min-h-screen bg-[#05070c] text-slate-100 grid place-items-center"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-orange-400"/><p className="mt-3 text-sm text-slate-400">Loading BharatShop company state…</p></div></main>;
  }

  return <main className="min-h-screen bg-[#05070c] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(249,115,22,.12),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(34,211,238,.09),transparent_28%),radial-gradient(circle_at_65%_90%,rgba(168,85,247,.08),transparent_30%)]"/>
    <div className="relative mx-auto max-w-[1900px] p-3 md:p-6">
      <header className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-5 md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-300"><Network size={15}/> BharatShop AI Company OS <span className={`rounded-full border px-2 py-1 ${tone(agentHealth?.summary?.allReady ? "OPERATIONAL" : data?.status)}`}>{agentHealth?.summary?.allReady ? "13/13 operational" : data?.status || "UNKNOWN"}</span></div>
            <h1 className="text-3xl font-black tracking-[-0.045em] md:text-5xl">Founder Command Centre</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">One place to run the AI company, inspect live infrastructure, review products visually, open the BharatShop app, and hand creative work to the Fashion + Higgsfield pipeline without pretending external tools are locally connected when they are not.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/store" className={button}><Store size={15} className="mr-2 inline"/>Open store</a>
            <a href="/dashboard/fashion" className={button}><Shirt size={15} className="mr-2 inline"/>Fashion studio</a>
            <button className={button} onClick={() => void installApp()}><Smartphone size={15} className="mr-2 inline"/>Install app</button>
            <button className={button} disabled={!!busy} onClick={() => void load()}><RefreshCw size={15} className="mr-2 inline"/>Refresh</button>
            <button className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40" disabled={!!busy || !growthObjective.trim()} onClick={() => void companyCommand({ action: "start_growth_cycle", objective: growthObjective }, "growth")}><Sparkles size={16} className="mr-2 inline"/>Launch growth cycle</button>
          </div>
        </div>
      </header>

      {notice && <div className="mb-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">{notice}</div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(({ label, value, Icon }) => <div key={label} className={`${panel} p-4`}><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</span><Icon size={17} className="text-slate-500"/></div><div className="mt-2 text-2xl font-black">{value}</div></div>)}
      </section>

      <section className={`${panel} mb-5 p-4 md:p-5`}>
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Live infrastructure + integrations</div><h2 className="mt-1 text-xl font-black">Operational, external and blocked states are separated</h2></div><div className="text-xs text-slate-500">AI model: <span className="font-bold text-slate-300">{health?.models?.text || "unknown"}</span></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <IntegrationCard icon={Database} title="PostgreSQL" status={health?.readiness?.postgres?.ready ? "READY" : "BLOCKED"} detail={health?.readiness?.postgres?.ready ? "Local shared company state is reachable." : health?.readiness?.postgres?.reason || "Database probe failed."}/>
          <IntegrationCard icon={BrainCircuit} title="Local AI" status={health?.readiness?.ai?.ready ? "READY" : "BLOCKED"} detail={health?.readiness?.ai?.ready ? `${health?.models?.text || "AI model"} passed the live probe.` : health?.readiness?.ai?.reason || "AI provider is unavailable."}/>
          <IntegrationCard icon={Network} title="Search" status={health?.readiness?.searxng?.ready ? "READY" : "BLOCKED"} detail={health?.readiness?.searxng?.ready ? "SearXNG live search passed." : health?.readiness?.searxng?.reason || "Search is unavailable."}/>
          <IntegrationCard icon={Users} title="Agent OS" status={agentHealth?.summary?.allReady ? "OPERATIONAL" : "PARTIAL"} detail={`${Number(agentHealth?.summary?.ready || 0)}/${Number(agentHealth?.summary?.total || data?.agents?.length || 0)} operational agents passed the deep probe.`}/>
          <IntegrationCard icon={PlugZap} title="ChatGPT bridge" status="EXTERNAL" detail="ChatGPT is an external operator surface, not a fake local API. Use it for connected plugins and founder workflows." href="https://chatgpt.com/" hrefLabel="Open ChatGPT"/>
          <IntegrationCard icon={WandSparkles} title="Higgsfield" status="EXTERNAL" detail="Use the official Higgsfield ChatGPT plugin/MCP for rendered media. The browser app keeps prompts and product evidence; it does not invent hidden Higgsfield credentials." href="https://higgsfield.ai/mcp" hrefLabel="Open Higgsfield connector"/>
        </div>
      </section>

      <section className={`${panel} mb-5 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div><div className="flex items-center gap-2 text-sm font-black"><ImageIcon size={17} className="text-violet-300"/>Live product media</div><p className="mt-1 text-xs text-slate-500">Actual product images attached to Fashion Agent records, not decorative stock placeholders.</p></div>
          <a href="/dashboard/fashion" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-violet-300">Open visual studio<ExternalLink size={13}/></a>
        </div>
        {catalogMedia.length ? <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 xl:grid-cols-8">
          {catalogMedia.map((product) => <a key={product.id} href="/dashboard/fashion" className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="aspect-[4/5] overflow-hidden bg-slate-900"><img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"/></div>
            <div className="p-2.5"><div className="line-clamp-1 text-xs font-black text-white">{product.title}</div><div className="mt-1 flex items-center justify-between text-[10px] text-slate-500"><span>{product.status || "product"}</span>{typeof product.sellingPriceInr === "number" && <span>₹{Math.round(product.sellingPriceInr).toLocaleString("en-IN")}</span>}</div></div>
          </a>)}
        </div> : <div className="m-4 grid min-h-36 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center"><div><ImageIcon className="mx-auto text-slate-600"/><div className="mt-2 text-sm font-bold text-slate-300">No attached product media yet</div><p className="mt-1 text-xs text-slate-500">Open Fashion Studio and attach verified product media or a Higgsfield result. Empty media stays visibly empty instead of showing fake images.</p></div></div>}
      </section>

      <section className={`${panel} mb-5 p-4`}>
        <div className="grid gap-4 xl:grid-cols-[1.3fr_auto] xl:items-end">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Company growth objective</div>
            <textarea value={growthObjective} onChange={(event) => setGrowthObjective(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-orange-500"/>
            {activeGoal && <div className="mt-2 text-xs text-slate-500">Current active goal: <span className="font-bold text-slate-300">{activeGoal.title}</span> · {activeGoal.objective}</div>}
          </div>
          <button className={button} disabled={!!busy || !(counts.get("QUEUED") || 0)} onClick={() => void companyCommand({ action: "run_queue", limit: 2 }, "queue")}><Workflow size={16} className="mr-2 inline"/>Run next 2 queued agents</button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_390px]">
        <aside className={`${panel} overflow-hidden`}>
          <div className="border-b border-white/10 p-4"><div className="flex items-center gap-2 font-black"><Users size={18}/> AI Team</div><div className="mt-1 text-xs text-slate-500">{data?.agents?.length || 0} operational contracts</div></div>
          <div className="max-h-[76vh] space-y-2 overflow-y-auto p-3">
            {(data?.agents || []).map((item) => {
              const latest = latestMap.get(item.id);
              return <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-orange-500/60 bg-orange-500/10" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="font-bold">{item.name}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.mission}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${tone(latest?.status || "IDLE")}`}>{latest?.status || "IDLE"}</span></div>
                <div className="mt-2 text-[11px] text-slate-600">{latest ? `last work ${timeAgo(latest.updated_at)}` : "no company-bus run yet"}</div>
              </button>;
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className={`${panel} overflow-hidden`}>
            <div className="border-b border-white/10 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-orange-300">Personal agent dashboard</div><h2 className="mt-1 text-2xl font-black">{agent?.name || "Agent"}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{agent?.mission}</p></div><span className={`self-start rounded-full border px-3 py-1.5 text-xs font-black ${tone(latestMap.get(selectedId)?.status || "IDLE")}`}>{latestMap.get(selectedId)?.status || "IDLE"}</span></div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Permitted tools</div><div className="mt-2 flex flex-wrap gap-2">{agent?.tools?.map((tool) => <span key={tool} className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-slate-300">{tool}</span>)}</div></div>
              <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Approval boundary</div><p className="mt-2 text-sm leading-6 text-amber-200/80">{agent?.approvalBoundary}</p></div>
            </div>
            <div className="border-t border-white/10 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Give this agent a real objective</div>
              <div className="mt-2 flex flex-col gap-2 lg:flex-row"><textarea value={objective} onChange={(event) => setObjective(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runSelectedAgent(); } }} rows={3} placeholder={`Ask ${agent?.name || "this agent"} to inspect, research, verify, plan or execute within its permitted tools…`} className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-orange-500"/><button onClick={() => void runSelectedAgent()} disabled={!!busy || !objective.trim()} className="rounded-xl bg-orange-500 px-5 py-3 font-black text-slate-950 disabled:opacity-40"><Play size={16} className="mr-2 inline"/>Run agent</button></div>
            </div>
          </div>

          <div className={`${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between"><div><div className="font-black">Work ledger</div><div className="text-xs text-slate-500">Persistent jobs and receipts for {agent?.name}</div></div><Database size={18} className="text-slate-600"/></div>
            <div className="space-y-2">{agentWork.length ? agentWork.map((work) => <details key={work.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-bold">{work.title}</div><div className="mt-1 text-xs text-slate-500">priority {work.priority} · {timeAgo(work.updated_at)}</div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${tone(work.status)}`}>{work.status}</span></div></summary><div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400"><div className="font-bold text-slate-300">Objective</div><p className="mt-1 whitespace-pre-wrap">{work.objective}</p>{work.output?.reply && <><div className="mt-3 font-bold text-slate-300">Agent result</div><p className="mt-1 whitespace-pre-wrap text-slate-300">{work.output.reply}</p></>}{work.output?.toolExecutions?.length ? <div className="mt-3 flex flex-wrap gap-2">{work.output.toolExecutions.map((trace, index) => <span key={`${trace.tool}-${index}`} className="rounded-full border border-white/10 px-2 py-1">{trace.tool || "runtime"} · {trace.status || "UNKNOWN"}</span>)}</div> : null}</div></details>) : <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No company-bus work has been assigned to this agent yet.</div>}</div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className={`${panel} p-4`}><div className="flex items-center gap-2 font-black"><AppWindow size={18}/> BharatShop app</div><p className="mt-2 text-xs leading-5 text-slate-500">The storefront and operator tools are available as an installable web app when the browser exposes the PWA install prompt.</p><div className="mt-3 grid grid-cols-2 gap-2"><a href="/" className={button}><Store size={14} className="mr-1 inline"/>Open app</a><button onClick={() => void installApp()} className={button}><Smartphone size={14} className="mr-1 inline"/>Install</button></div></div>

          <div className={`${panel} p-4`}><div className="flex items-center gap-2 font-black"><BrainCircuit size={18}/> Shared company brain</div><p className="mt-2 text-xs leading-5 text-slate-500">{data?.policy?.sharedData}</p><div className="mt-3 max-h-[310px] space-y-2 overflow-y-auto">{(data?.sharedEvents || []).slice(0, 16).map((event) => <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{event.agent_id}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${tone(event.status)}`}>{event.status}</span></div><p className="mt-2 text-xs leading-5 text-slate-300">{event.summary}</p><div className="mt-1 text-[10px] text-slate-600">{timeAgo(event.created_at)}</div></div>)}</div></div>

          <div className={`${panel} p-4`}><div className="flex items-center gap-2 font-black"><ShieldCheck size={18}/> Company constitution</div><div className="mt-3 space-y-2 text-xs leading-5 text-slate-400"><p><span className="font-bold text-slate-200">Source of truth:</span> {data?.policy?.sourceOfTruth}</p><p><span className="font-bold text-slate-200">Evidence:</span> {data?.policy?.evidenceRule}</p><p><span className="font-bold text-slate-200">Human-only gates:</span> {(data?.policy?.approvalGates || []).join(", ")}</p></div></div>

          <div className={`${panel} p-4`}><div className="flex items-center gap-2 font-black"><Activity size={18}/> Live systems</div><div className="mt-3 space-y-2">{Object.entries(services?.services || {}).map(([name, value]) => <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><span className="text-xs font-bold">{name.replace(/([A-Z])/g, " $1")}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${tone(value?.status)}`}>{value?.status || "UNKNOWN"}</span></div>)}</div>{services?.actions?.length ? <div className="mt-4"><div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-600">Bounded operations</div><div className="flex flex-wrap gap-2">{services.actions.slice(0, 8).map((action) => <button key={action.id} disabled={!!busy} onClick={() => void runSystemAction(action.id)} className="rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-1.5 text-[11px] font-bold hover:border-white/20 disabled:opacity-40">{action.label}</button>)}</div></div> : null}</div>

          {agentEvents.length > 0 && <div className={`${panel} p-4`}><div className="font-black">Selected agent feed</div><div className="mt-3 space-y-2">{agentEvents.slice(0, 5).map((event) => <div key={event.id} className="text-xs leading-5 text-slate-400"><span className="font-bold text-slate-200">{event.event_type}:</span> {event.summary}</div>)}</div></div>}
        </aside>
      </div>

      {lastRun !== null && <details className={`${panel} mt-5 p-4`}><summary className="cursor-pointer text-sm font-black">Latest command receipt</summary><pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[11px] leading-5 text-slate-400">{JSON.stringify(lastRun, null, 2)}</pre></details>}
    </div>
  </main>;
}
