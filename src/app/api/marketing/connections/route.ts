import { NextResponse } from "next/server";
import { marketingConnections, verifyMarketingConnections } from "@/lib/marketing/connections";
import { metaConfiguration } from "@/lib/marketing/meta-config";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ channels: marketingConnections(), metaConfiguration: metaConfiguration(), spendEnabled: false, execution: "approval_required" }, { headers: { "Cache-Control": "no-store" } });
}
// Authenticated, read-only provider probes; this endpoint never publishes or spends.
export async function POST() {
  return NextResponse.json({ channels: await verifyMarketingConnections(), metaConfiguration: metaConfiguration(), spendEnabled: false,
    execution: "approval_required", checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
