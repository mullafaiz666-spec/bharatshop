export default String.raw`import { useState } from "react";

const NAV = [
  ["/", "Chat", "⌁"],
  ["/agents", "Agents", "◈"],
  ["/tasks", "Runs", "▤"],
  ["/integrations", "MCP", "⛓"],
  ["/approvals", "Approvals", "✓"],
  ["/machine-ai", "Runtime", "◉"],
];

function activePath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export default function ControlCenterShell({ children, eyebrow, title, subtitle }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = activePath();

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(99,102,241,.12),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(16,185,129,.08),transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] flex-col border-r border-white/[0.07] bg-[#0a0d13]/95 px-3 py-4 backdrop-blur-xl lg:flex">
        <a href="/" className="flex items-center gap-3 rounded-2xl px-3 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black shadow-[0_0_35px_rgba(99,102,241,.25)]">B</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black tracking-[-.02em] text-white">BharatShop Copilot</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">local command OS</div>
          </div>
        </a>

        <nav className="mt-5 space-y-1">
          {NAV.map(([href, label, icon]) => {
            const active = path === href;
            return (
              <a
                key={href}
                href={href}
                className={
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition " +
                  (active ? "bg-white/[0.08] text-white" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")
                }
              >
                <span className={"grid h-7 w-7 place-items-center rounded-lg text-xs " + (active ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.03] text-slate-600")}>{icon}</span>
                <span>{label}</span>
              </a>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.75)]" /> Local runtime
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-500">Qwen, agents, MCP and build tools stay attached to this laptop.</div>
        </div>
      </aside>

      {mobileOpen ? <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/70 lg:hidden" /> : null}
      <aside className={"fixed inset-y-0 left-0 z-50 w-[278px] border-r border-white/[0.08] bg-[#0a0d13] p-4 transition-transform lg:hidden " + (mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-5 flex items-center justify-between">
          <div className="font-black">BharatShop Copilot</div>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400">Close</button>
        </div>
        <nav className="space-y-1">
          {NAV.map(([href, label]) => <a key={href} href={href} className="block rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5">{label}</a>)}
        </nav>
      </aside>

      <div className="relative min-h-screen lg:pl-[238px]">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-white/[0.06] bg-[#07090e]/85 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="mr-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 lg:hidden">Menu</button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-slate-300">{title || "BharatShop Copilot"}</div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-slate-500 sm:inline">private workstation</span>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 font-bold text-emerald-300">guardrails on</span>
          </div>
        </header>

        <main className="relative">
          {(eyebrow || subtitle) ? (
            <div className="px-4 pt-6 sm:px-6">
              <div className="mx-auto max-w-[1500px]">
                {eyebrow ? <div className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-300">{eyebrow}</div> : null}
                {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p> : null}
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({ title, description, children, className = "" }) {
  return (
    <section className={"rounded-2xl border border-white/[0.07] bg-[#0d1119]/82 shadow-[0_20px_80px_rgba(0,0,0,.18)] " + className}>
      {(title || description) ? (
        <div className="border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
          {title ? <h3 className="text-sm font-black tracking-[-.015em] text-white">{title}</h3> : null}
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Status({ tone = "neutral", children }) {
  const tones = {
    good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    blocked: "border-rose-500/20 bg-rose-500/10 text-rose-300",
    neutral: "border-white/[0.08] bg-white/[0.035] text-slate-400",
  };
  return <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[.08em] " + (tones[tone] || tones.neutral)}>{children}</span>;
}
`;
