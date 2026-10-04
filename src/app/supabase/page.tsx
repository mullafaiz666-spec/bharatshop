import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupabaseConnectionPage() {
  let state: "connected" | "unavailable" | "unconfigured" = "unconfigured";
  let visibleProducts: number | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    state = "unavailable";
    try {
      const supabase = await createClient();
      const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true });
      if (!error) {
        state = "connected";
        visibleProducts = count;
      }
    } catch {
      // Render an explicit unavailable state without exposing upstream details.
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">
        <Link href="/" className="font-black">BHARATSHOP</Link>
        <h1 className="mt-8 text-3xl font-bold">Supabase connection</h1>
        <p className="mt-4" role="status">
          {state === "connected" ? "Database API connected." : state === "unconfigured" ? "Supabase is not configured in this deployment." : "Database API is unavailable or access is denied."}
        </p>
        {state === "connected" && <p className="mt-3">Products visible to this session: <strong>{visibleProducts ?? 0}</strong></p>}
        <p className="mt-6 text-sm text-slate-600">This checks the Supabase API with the publishable client. A zero count can mean an empty table or rows hidden by access policies. The original catalogue still needs recovery and schema migration before the store can switch databases.</p>
        <Link href="/store" className="mt-8 inline-block rounded-full bg-black px-5 py-3 text-white">Return to store</Link>
      </section>
    </main>
  );
}
