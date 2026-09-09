import { NextResponse } from "next/server";
import { marketingConnections, verifyMarketingConnections } from "@/lib/marketing/connections";
export const dynamic = "force-dynamic";
export async function GET(req:Request) {
  const verify = new URL(req.url).searchParams.get("verify") === "1";
  const channels = verify ? await verifyMarketingConnections() : marketingConnections();
  return NextResponse.json({ channels,
    verified: verify,
    anyConnected: channels.some(c => c.connected && c.status === "VERIFIED"),
    anyConfigured: channels.some(c => c.configured),
    verificationEndpoint: "/api/marketing/connections",
    spendEnabled: false,
    execution: "approval_required",
    externalCampaignRule: "New paid campaigns must remain PAUSED until explicit owner approval and a provider receipt exists.",
  }, { headers: { "Cache-Control": "no-store" } });
}
