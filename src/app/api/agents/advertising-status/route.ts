import { NextResponse } from "next/server";
import { marketingConnections } from "@/lib/marketing/connections";
export const dynamic = "force-dynamic";
export async function GET() {
  const channels = marketingConnections();
  return NextResponse.json({ channels, anyConnected: false, anyConfigured: channels.some(c => c.configured),
    verificationEndpoint: "/api/marketing/connections", rule: "Credentials alone do not verify a connection. Campaign publication requires owner approval and a provider receipt." });
}
