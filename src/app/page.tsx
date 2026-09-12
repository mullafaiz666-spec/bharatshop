import Link from "next/link";
import StorePage from "./store/page";

const operatorLinks = [
  { href: "/dashboard", label: "Dashboard", detail: "Live business overview" },
  { href: "/dashboard/command-centre", label: "Command Centre", detail: "CEO and department coordination" },
  { href: "/agents", label: "Agent Studio", detail: "Work directly with specialist agents" },
  { href: "/dashboard/marketing", label: "Marketing", detail: "Campaign and content cockpit" },
  { href: "/dashboard/fashion", label: "Fashion Studio", detail: "Design and publish products" },
] as const;

export default function RootPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.20),transparent_35%),radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_32%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">BharatShop</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Storefront + AI Company Command System</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Shop the live BharatShop catalogue below, or enter the protected operations workspace to manage products, orders, marketing, fashion and the agent team.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="#storefront" className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400">
                Shop now
              </a>
              <Link href="/admin-login" className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10">
                Operator login
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {operatorLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-orange-400/50 hover:bg-white/[0.07]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black">{item.label}</span>
                  <span className="text-orange-400 transition group-hover:translate-x-1">→</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-slate-400">
            <span><span className="mr-2 text-emerald-400">●</span>Live storefront</span>
            <span><span className="mr-2 text-cyan-400">●</span>AI agent workspace</span>
            <span><span className="mr-2 text-orange-400">●</span>Protected operator controls</span>
          </div>
        </div>
      </section>

      <div id="storefront" className="bg-slate-50 text-slate-900">
        <StorePage />
      </div>
    </main>
  );
}
