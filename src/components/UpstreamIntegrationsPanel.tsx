"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, CircleAlert, Film, MessageSquareText, RefreshCw, ShieldAlert, Sparkles, Workflow, Wrench } from "lucide-react";

type Integration = {
  id:
    | "remotion"
    | "openhands"
    | "personalive"
    | "mumu-ai-novel"
    | "marketing-skills"
    | "dify"
    | "librechat"
    | "agentmemory"
    | "browser-use"
    | "diagram-design"
    | "scientific-agent-skills";
  name: string;
  repository: string;
  commit: string;
  purpose: string;
  mode: "external-service" | "agent-skills";
  license: string;
  requested: boolean;
  configured: boolean;
  enabled: boolean;
  endpointConfigured: boolean;
  tokenConfigured: boolean;
  blockedByPolicy: boolean;
  notes: string;
  health?: "READY" | "DISABLED" | "NOT_CONFIGURED" | "BLOCKED" | "ERROR";
  localInstalled?: boolean;
  localFiles?: number;
};

type Payload = {
  status: string;
  verificationPerformed: boolean;
  integrations: Integration[];
  summary: { total: number; configured: number; enabled: number; blocked: string[]; errors: string[] };
  bootstrap?: {
    command: string;
    fullWorkstationCommand: string;
    statusCommand: string;
    stopCommand: string;
    skillUpgradeCommand?: string;
  };
  policy: string;
};

const ICONS = {
  remotion: Film,
  openhands: Wrench,
  personalive: Bot,
  "mumu-ai-novel": Sparkles,
  "marketing-skills": CheckCircle2,
  dify: Workflow,
  librechat: MessageSquareText,
  agentmemory: Bot,
  "browser-use": Wrench,
  "diagram-design": Workflow,
  "scientific-agent-skills": CheckCircle2,
} satisfies Record<Integration["id"], typeof Film>;

function statusFor(item: Integration) {
  if (item.blockedByPolicy) return "BLOCKED";
  if (item.health) return item.health;
  if (item.enabled) return "READY";
  if (item.configured) return "CONFIGURED";
  return "NOT_CONFIGURED";
}

function tone(status: string) {
  if (status === "READY" || status === "CONFIGURED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "BLOCKED" || status === "ERROR") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

export default function UpstreamIntegrationsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/upstream?verify=1", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load upstream integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readyCount = useMemo(() => (data?.integrations || []).filter((item) => statusFor(item) === "READY").length, [data]);
  const total = data?.summary?.total || 11;

  const runAction = useCallback(async (integration: Integration["id"], action: string) => {
    const key = `${integration}:${action}`;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/upstream/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integration, action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      if (action === "open" && body?.url) {
        window.open(body.url, "_blank", "noopener,noreferrer");
        setNotice(`${integration} opened in a new tab.`);
      } else if (integration === "remotion" && action === "render-product-ad" && body?.result?.url) {
        window.open(body.result.url, "_blank", "noopener,noreferrer");
        setNotice("Remotion rendered a real BharatShop product-ad MP4 and opened it in a new tab.");
      } else {
        setNotice(`${integration} action completed.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integration action failed");
    } finally {
      setBusy("");
    }
  }, [load]);

  return (
    <section className="mx-auto max-w-[1800px] px-3 pt-4 md:px-6">
      <div className="overflow-hidden rounded-3xl border border-orange-500/30 bg-slate-950 shadow-2xl shadow-orange-950/10">
        <div className="border-b border-slate-800 bg-gradient-to-r from-orange-500/15 via-slate-950 to-cyan-500/10 p-5 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-300"><Bot size={17} /> Connected Build Runtime</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">BharatShop AI service automation</h1>
              <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-300">
                Live control for isolated AI services plus pinned workstation skills. AgentMemory adds shared agent recall; Browser Use, Diagram Design and selected scientific-analysis skills extend operator agents without entering the customer storefront bundle.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-4 py-2 text-sm font-black ${readyCount >= Math.max(1, total - 1) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>{readyCount}/{total} LIVE</span>
              <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-100 hover:border-slate-500 disabled:opacity-50">
                <RefreshCw size={15} className={`mr-2 inline ${loading ? "animate-spin" : ""}`} />Verify live
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-black/30 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">One-command workstation</div>
              <code className="mt-1 block break-all text-sm font-bold text-cyan-300">{data?.bootstrap?.fullWorkstationCommand || "npm run dev:full"}</code>
              <p className="mt-1 text-xs text-slate-500">Starts the existing isolated service stack and launches Next.js without changing production database ownership.</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-black/30 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pinned agent upgrade skills</div>
              <code className="mt-1 block break-all text-sm font-bold text-cyan-300">{data?.bootstrap?.skillUpgradeCommand || "npm run skills:upgrades:sync"}</code>
              <p className="mt-1 text-xs text-slate-500">Installs only Browser Use, Diagram Design, Statsmodels and Scientific Visualization into the agent workstation.</p>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500">Live verification: <span className="font-bold text-slate-300">{data?.verificationPerformed ? "authenticated" : "pending"}</span></div>
        </div>

        <div className="p-4 md:p-5">
          {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          {notice && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {(data?.integrations || []).map((item) => {
              const Icon = ICONS[item.id];
              const status = statusFor(item);
              const ready = status === "READY";
              return (
                <article key={item.id} className={`rounded-2xl border p-4 ${ready ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-slate-800 bg-slate-900/60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-orange-300"><Icon size={18} /></div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${tone(status)}`}>{status.replaceAll("_", " ")}</span>
                  </div>
                  <h3 className="mt-3 font-black text-slate-100">{item.name}</h3>
                  <p className="mt-1 min-h-16 text-xs leading-5 text-slate-400">{item.purpose}</p>

                  {item.localInstalled && (
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Pinned local install verified{item.localFiles ? ` · ${item.localFiles} files` : ""}</div>
                  )}

                  {item.id === "dify" && (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">Single-workspace integration only. Multi-tenant SaaS use or Dify frontend branding changes require license review.</div>
                  )}

                  {item.blockedByPolicy && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200"><ShieldAlert size={15} className="mt-0.5 shrink-0" />Commercial activation remains blocked until rights are approved.</div>
                  )}

                  {!item.blockedByPolicy && !ready && item.mode === "external-service" && item.id !== "agentmemory" && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200"><CircleAlert size={15} className="mt-0.5 shrink-0" />Run <code className="font-bold">npm run upstreams:bootstrap</code>.</div>
                  )}

                  {!ready && item.id === "agentmemory" && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200"><CircleAlert size={15} className="mt-0.5 shrink-0" />Start a private AgentMemory service and set <code className="font-bold">AGENTMEMORY_URL</code>.</div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.id === "remotion" && (
                      <button disabled={!ready || Boolean(busy)} onClick={() => void runAction("remotion", "render-product-ad")} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy === "remotion:render-product-ad" ? "Rendering…" : "Render test MP4"}</button>
                    )}
                    {item.id === "openhands" && (
                      <button disabled={!ready || Boolean(busy)} onClick={() => void runAction("openhands", "open")} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">Open Agent Canvas</button>
                    )}
                    {item.id === "mumu-ai-novel" && (
                      <button disabled={!ready || Boolean(busy)} onClick={() => void runAction("mumu-ai-novel", "open")} className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200 disabled:cursor-not-allowed disabled:opacity-40">Open Creative Studio</button>
                    )}
                    {item.id === "dify" && (
                      <button disabled={!ready || Boolean(busy)} onClick={() => void runAction("dify", "open")} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-200 disabled:cursor-not-allowed disabled:opacity-40">Open Dify Studio</button>
                    )}
                    {item.id === "librechat" && (
                      <button disabled={!ready || Boolean(busy)} onClick={() => void runAction("librechat", "open")} className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-black text-teal-200 disabled:cursor-not-allowed disabled:opacity-40">Open LibreChat</button>
                    )}
                    {item.mode === "agent-skills" && ready && <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200">Agent skills active</span>}
                  </div>

                  <div className="mt-4 text-[10px] leading-4 text-slate-600">{item.license}</div>
                </article>
              );
            })}
          </div>

          {data?.policy && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs leading-5 text-slate-500">{data.policy}</div>}
        </div>
      </div>
    </section>
  );
}
