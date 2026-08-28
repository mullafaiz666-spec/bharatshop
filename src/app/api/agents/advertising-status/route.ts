import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const channels = [
    { key: "google", label: "Google Ads", connected: Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN) },
    { key: "meta", label: "Facebook / Instagram", connected: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID) },
    { key: "whatsapp", label: "WhatsApp", connected: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) },
  ];
  return NextResponse.json({ channels, anyConnected: channels.some(c => c.connected), rule: "Campaigns are never marked LIVE unless a real channel account is connected." });
}
