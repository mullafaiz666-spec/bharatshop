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
    <Link href="/dashboard/fashion" className="fixed bottom-5 right-5 z-[80] rounded-2xl border border-orange-400/40 bg-orange-500 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-orange-950/40 transition hover:bg-orange-400">
      👕 Fashion Studio
    </Link>
    <DashboardV2 />
  </>;
}
