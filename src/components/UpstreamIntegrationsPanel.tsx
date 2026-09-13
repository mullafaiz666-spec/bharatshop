"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, CircleAlert, Film, RefreshCw, ShieldAlert, Sparkles, Wrench } from "lucide-react";

type Integration = {
  id: "remotion" | "openhands" | "personalive" | "mumu-ai-novel" | "marketing-skills";
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
  policy: string;
};

const ENVIRONMENT: Record<Integration["id"], string[]> = {
  remotion: ["BHARATSHOP_REMOTION_ENABLED", "REMOTION_SERVICE_URL", "REMOTION_SERVICE_TOKEN"],
  openhands: ["BHARATSHOP_OPENHANDS_ENABLED", "OPENHANDS_AGENT_SERVER_URL", "OPENHANDS_AGENT_SERVER_TOKEN"],
  personalive: ["BHARATSHOP_PERSONALIVE_ENABLED", "PERSONALIVE_SERVICE_URL", "PERSONALIVE_SERVICE_TOKEN", "PERSONALIVE_COMMERCIAL_USE_APPROVED"],
  "mumu-ai-novel": ["BHARATSHOP_MUMU_ENABLED", "MUMU_AI_SERVICE_URL", "MUMU_AI_SERVICE_TOKEN"],
  "marketing-skills": ["BHARATSHOP_MARKETING_SKILLS_ENABLED"],
};

const ICONS = {
  remotion: Film,
  openhands: Wrench,
  personalive: Bot,
  "mumu-ai-novel": Sparkles,
  "marketing-skills": CheckCircle2,
} satisfies Record<Integration["id"], typeof Film>;

function statusFor(item: Integration) {
  if (item.blockedByPolicy) return "BLOCKED";
  if (item.health) return item.health;
  if (item.enabled) return "READY";
  if (item.configured) return "CONFIGURED";
  return "NOT CONFIGURED";
}

function tone(status: string) {
  if (status === "READY" || status === "CONFIGURED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "BLOCKED" || status === "ERROR") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

export default function UpstreamIntegrationsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/upstream", { cache: "no-store" });
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

  return (
    <section className="mx-auto mt-5 max-w-[1800px] px-3 pb-8 md:px-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-xl shadow-black/10 md:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
              <Bot size={16} /> Upstream AI Services
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-100">5 connected capability tracks</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400">
              Marketing Skills can run from this workstation. Remotion, OpenHands and MuMu stay isolated as external services. PersonaLive stays blocked until commercial/model rights are explicitly approved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300">{readyCount}/5 ready</span>
            <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 hover:border-slate-500 disabled:opacity-50">
              <RefreshCw size={15} className={`mr-2 inline ${loading ? "animate-spin" : ""}`} />Refresh
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-5">
          {(data?.integrations || []).map((item) => {
            const Icon = ICONS[item.id];
            const status = statusFor(item);
            return (
              <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-orange-300"><Icon size={18} /></div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${tone(status)}`}>{status}</span>
                </div>
                <h3 className="mt-3 font-black text-slate-100">{item.name}</h3>
                <p className="mt-1 min-h-16 text-xs leading-5 text-slate-400">{item.purpose}</p>

                {item.id === "marketing-skills" && item.localInstalled && (
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    Local install verified{item.localFiles ? ` · ${item.localFiles} files` : ""}
                  </div>
                )}

                {item.blockedByPolicy && (
                  <div className="mt-3 flex gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">
                    <ShieldAlert size={15} className="mt-0.5 shrink-0" />Commercial activation is blocked pending rights approval.
                  </div>
                )}

                {!item.blockedByPolicy && !item.enabled && item.mode === "external-service" && (
                  <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                    <CircleAlert size={15} className="mt-0.5 shrink-0" />Deploy the service separately, then add its endpoint below.
                  </div>
                )}

                <div className="mt-4 space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Configuration</div>
                  {ENVIRONMENT[item.id].map((name) => <code key={name} className="block break-all rounded-md bg-slate-950 px-2 py-1 text-[10px] text-slate-400">{name}</code>)}
                </div>
                <div className="mt-3 text-[10px] text-slate-600">{item.license}</div>
              </article>
            );
          })}
        </div>

        {data?.policy && <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs leading-5 text-slate-500">{data.policy}</div>}
      </div>
    </section>
  );
}
