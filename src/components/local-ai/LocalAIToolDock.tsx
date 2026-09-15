"use client";

import Link from "next/link";
import {
  Bot,
  BrainCircuit,
  ChevronRight,
  CircleGauge,
  Database,
  LayoutDashboard,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

type SystemStatus = {
  ok: boolean;
  machine: {
    state: string;
    updatedAt: string;
    localModel: string;
    ollama: string;
    qwenShim: string;
    agents: number;
    pendingTasks: number;
    completedTasks: number;
    detail: string;
  };
  memory: Record<string, number>;
  agency: { agents: number; divisions: string[] };
  shortcuts: Array<{ label: string; href: string }>;
};

const shortcutIcons: Record<string, typeof Store> = {
  BharatShop: ShoppingBag,
  BharatDrip: Store,
  Agents: Users,
  "Command Centre": LayoutDashboard,
};

export default function LocalAIToolDock() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/local-ai/system", { cache: "no-store" });
      const data = (await response.json()) as SystemStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "System status unavailable");
      setStatus(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "System status unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const memoryTotal = status
    ? Object.values(status.memory).reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;

  return (
    <div className="pointer-events-none fixed right-3 top-20 z-[70] sm:right-5">
      <div className="pointer-events-auto flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-[#151820]/95 px-3 text-xs font-black text-slate-200 shadow-2xl backdrop-blur hover:bg-[#1a1e27]"
          aria-expanded={open}
        >
          {open ? <X size={16} /> : <CircleGauge size={16} className="text-emerald-400" />}
          <span className="hidden sm:inline">System</span>
        </button>
      </div>

      {open && (
        <aside className="pointer-events-auto mt-2 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-white/10 bg-[#11141b]/98 shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Laptop command centre</p>
              <h2 className="mt-1 text-base font-black text-white">Local AI system</h2>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
              aria-label="Refresh local AI system status"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="space-y-4 p-4">
            {error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{error}</div>
            ) : !status ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">Loading local runtime…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <StatusCard icon={Bot} label="Machine AI" value={status.machine.state || "UNKNOWN"} good={status.machine.state === "LOCAL_READY"} />
                  <StatusCard icon={Users} label="Agents" value={String(status.agency.agents)} good={status.agency.agents > 0} />
                  <StatusCard icon={Database} label="Memory" value={String(memoryTotal)} good />
                  <StatusCard icon={BrainCircuit} label="Pending" value={String(status.machine.pendingTasks)} good={status.machine.pendingTasks === 0} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-white"><Sparkles size={14} className="text-emerald-400" /> Runtime</div>
                  <div className="mt-3 grid gap-2 text-[11px] text-slate-400">
                    <RuntimeRow label="Model" value={status.machine.localModel || "qwen3.5:4b"} />
                    <RuntimeRow label="Ollama" value={status.machine.ollama || "unknown"} />
                    <RuntimeRow label="Qwen shim" value={status.machine.qwenShim || "unknown"} />
                    <RuntimeRow label="Completed" value={String(status.machine.completedTasks)} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Open workspace</p>
                  <div className="grid gap-1.5">
                    {status.shortcuts.map((shortcut) => {
                      const Icon = shortcutIcons[shortcut.label] || ChevronRight;
                      return (
                        <Link
                          key={shortcut.href}
                          href={shortcut.href}
                          className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                        >
                          <Icon size={16} className="text-slate-500" />
                          <span className="flex-1">{shortcut.label}</span>
                          <ChevronRight size={14} className="text-slate-600" />
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl bg-emerald-400/10 p-3 text-[11px] leading-5 text-emerald-100">
                  This panel is read-only. Browser, coding, publishing, payments and production-changing actions remain separately approval-gated.
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        <Icon size={13} /> {label}
      </div>
      <p className={`mt-2 truncate text-sm font-black ${good ? "text-emerald-300" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="max-w-[190px] truncate font-bold text-slate-200">{value}</span>
    </div>
  );
}
