import DashboardV2 from "@/components/DashboardV2";
import { getAdminUser } from "@/lib/admin-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DashboardPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin-login");
  return <>
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-2">
      <Link href="/dashboard/command-centre" className="rounded-2xl border border-cyan-300/40 bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-cyan-950/40 transition hover:bg-cyan-200">
        🧠 AI Company Command Centre
      </Link>
      <Link href="/dashboard/marketing" className="rounded-2xl border border-lime-300/40 bg-lime-300 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-lime-950/40 transition hover:bg-lime-200">
        📣 Marketing Cockpit
      </Link>
      <Link href="/dashboard/fashion" className="rounded-2xl border border-orange-400/40 bg-orange-500 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-orange-950/40 transition hover:bg-orange-400">
        👕 Fashion Studio
      </Link>
    </div>
    <DashboardV2 />
  </>;
}
