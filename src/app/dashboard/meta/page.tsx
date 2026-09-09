import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { metaConfiguration } from "@/lib/marketing/meta-config";
import { marketingConnections } from "@/lib/marketing/connections";
import MetaConnectionCheck from "@/components/MetaConnectionCheck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta setup | BharatShop", robots: { index: false, follow: false } };

export default async function MetaSetupPage() {
  if (!await getAdminUser()) redirect("/admin-login");
  const config = metaConfiguration();
  const channels = marketingConnections().filter(channel => channel.key !== "google");
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <Link href="/dashboard" className="text-blue-300">← Dashboard</Link>
    <h1 className="text-3xl font-bold">Facebook & Instagram setup</h1>
    <p className="text-slate-300">Connect your catalog, Pixel and server events. Paid advertising stays disabled.</p>
    <section className="rounded-xl border border-slate-700 p-5 space-y-3">
      <h2 className="text-xl font-semibold">Configuration: {config.status.replaceAll("_", " ")}</h2>
      {config.issues.map(issue => <p key={issue} className="text-amber-300">{issue}</p>)}
      <p>Browser Pixel: {config.browserPixelConfigured ? "Configured" : "Missing"} · Server events: {config.conversionsApiConfigured ? "Configured" : "Incomplete"}</p>
      <p>Domain verification: {config.domainVerificationConfigured ? "Code configured; verify in Meta" : "Missing code"}</p>
      <p>Event mode: {config.testMode ? "Test Events — remove META_TEST_EVENT_CODE after validation" : "Live events when configured"}</p>
      <p className="text-slate-400">Configured settings still need provider verification. Public settings require a fresh Render build.</p>
    </section>
    <section className="grid gap-4 sm:grid-cols-2">
      {channels.map(channel => <article key={channel.key} className="rounded-xl border border-slate-700 p-5">
        <h2 className="font-semibold">{channel.label}</h2>
        <p className="my-2">{channel.status.replaceAll("_", " ")}</p>
        {channel.missing.length > 0 && <ul className="list-disc pl-5 break-words text-sm text-slate-300">{channel.missing.map(key => <li key={key}>{key}</li>)}</ul>}
      </article>)}
    </section>
    <MetaConnectionCheck />
    <section className="rounded-xl border border-slate-700 p-5 space-y-3">
      <h2 className="text-xl font-semibold">Connect in Meta</h2>
      <ol className="list-decimal pl-5 space-y-3 text-slate-300">
        <li>In Events Manager, select your website Pixel/Dataset. Set its numeric ID as both NEXT_PUBLIC_META_PIXEL_ID and META_PIXEL_ID in Render Environment.</li>
        <li>Generate a Conversions API token for that dataset and save it as META_CONVERSIONS_API_TOKEN in Render. Keep tokens in server settings.</li>
        <li>Add your domain verification code as NEXT_PUBLIC_META_DOMAIN_VERIFICATION. Deploy again, then verify the domain in Meta Business Settings.</li>
        <li>In Commerce Manager, add a scheduled data feed using this website’s <Link className="text-blue-300" href="/api/feeds/meta-catalog">Meta catalog feed</Link>. An empty feed means no products currently pass publication checks.</li>
        <li>For Page and Instagram verification, configure META_ACCESS_TOKEN, META_PAGE_ID and META_INSTAGRAM_ACCOUNT_ID for the linked business accounts.</li>
        <li>Use a temporary META_TEST_EVENT_CODE from Events Manager to check browser and server events. Remove it after testing and redeploy.</li>
      </ol>
    </section>
  </main>;
}
