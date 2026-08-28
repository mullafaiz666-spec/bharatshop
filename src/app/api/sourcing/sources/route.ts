import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Source = { id: string; name: string; type: "api" | "dropship" | "marketplace" | "whatsapp"; country: string; officialUrl: string; automation: "ready" | "requires_connection" | "manual_review"; notes: string };

const SOURCES: Source[] = [
  { id: "cj", name: "CJ Dropshipping", type: "api", country: "Global/India", officialUrl: "https://www.cjdropshipping.com/", automation: "requires_connection", notes: "API catalogue, inventory, freight and fulfillment after account authorization." },
  { id: "rdmall", name: "RDMall Direct", type: "dropship", country: "India", officialUrl: "https://rdmall.in/hi/direct", automation: "manual_review", notes: "Indian dropshipping marketplace; verify partner/order integration before automation." },
  { id: "bharatdropship", name: "Bharat Dropship", type: "dropship", country: "India", officialUrl: "https://www.bharatdropship.com/", automation: "manual_review", notes: "Indian multi-supplier dropshipping network; connect through an authorized integration." },
  { id: "seasonsway", name: "Seasonsway", type: "dropship", country: "India", officialUrl: "https://seasonsway.com/", automation: "manual_review", notes: "Indian dropshipping supplier; supplier onboarding/integration must be verified." },
  { id: "shein", name: "SHEIN Open Platform", type: "api", country: "India/eligible markets", officialUrl: "https://open.sheincorp.com/", automation: "requires_connection", notes: "Use only an approved Open Platform integration; no consumer-account checkout automation." },
  { id: "whatsapp-supplier", name: "WhatsApp Supplier Lead", type: "whatsapp", country: "India", officialUrl: "https://business.whatsapp.com/products/business-platform", automation: "requires_connection", notes: "Use WhatsApp Business Platform for supplier conversations where the supplier opts in; do not automate unsolicited messages." },
];

export async function GET() {
  return NextResponse.json({ sources: SOURCES, generatedAt: new Date().toISOString(), policy: "Only authorized APIs, feeds, partner portals and opted-in WhatsApp conversations may be automated." });
}
