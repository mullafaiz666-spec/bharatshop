import crypto from "node:crypto";

export type MetaStandardEvent = "PageView" | "ViewContent" | "AddToCart" | "AddToWishlist" | "InitiateCheckout" | "Purchase" | "Search";
export type MetaConversionInput = {
  eventName: MetaStandardEvent;
  eventId: string;
  eventSourceUrl?: string;
  eventTime?: number;
  clientIpAddress?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  customData?: Record<string, unknown>;
};

const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v26.0";
export const metaPixelId = () => (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
const capiToken = () => (process.env.META_CONVERSIONS_API_TOKEN || process.env.META_ACCESS_TOKEN || "").trim();
export const metaCapiConfigured = () => Boolean(metaPixelId() && capiToken());

function hash(value?: string, mode: "email" | "phone" | "generic" = "generic") {
  if (!value?.trim()) return undefined;
  let normalized = value.trim().toLowerCase();
  if (mode === "email") normalized = normalized.replace(/\s+/g, "");
  if (mode === "phone") normalized = normalized.replace(/[^0-9]/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function cleanObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export async function sendMetaConversion(input: MetaConversionInput) {
  const pixelId = metaPixelId(), token = capiToken();
  if (!pixelId || !token) return { configured: false, sent: false, reason: "missing_meta_pixel_or_capi_token" as const };
  if (!/^\d+$/.test(pixelId)) return { configured: true, sent: false, reason: "invalid_meta_pixel_id" as const };
  if (!/^v\d+\.\d+$/.test(graphVersion())) return { configured: true, sent: false, reason: "invalid_meta_graph_version" as const };
  const browserPixel = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  if (browserPixel && browserPixel !== pixelId) return { configured: true, sent: false, reason: "meta_pixel_id_mismatch" as const };
  const userData = cleanObject({
    client_ip_address: input.clientIpAddress,
    client_user_agent: input.userAgent,
    fbp: input.fbp,
    fbc: input.fbc,
    em: hash(input.email, "email") ? [hash(input.email, "email")] : undefined,
    ph: hash(input.phone, "phone") ? [hash(input.phone, "phone")] : undefined,
    external_id: hash(input.externalId) ? [hash(input.externalId)] : undefined,
  });
  const event = cleanObject({
    event_name: input.eventName,
    event_time: input.eventTime || Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    custom_data: input.customData,
  });
  const body: Record<string, unknown> = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE?.trim()) body.test_event_code = process.env.META_TEST_EVENT_CODE.trim();
  const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${pixelId}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  let result: any = null; try { result = await response.json(); } catch {}
  if (!response.ok) return { configured: true, sent: false, httpStatus: response.status, reason: "meta_rejected_event" as const };
  if (Number(result?.events_received || 0) < 1) return { configured: true, sent: false, httpStatus: response.status, reason: "meta_event_not_acknowledged" as const };
  return { configured: true, sent: true, httpStatus: response.status, eventsReceived: Number(result?.events_received || 0), traceId: result?.fbtrace_id ? String(result.fbtrace_id) : undefined };
}

export function readMetaCookies(cookieHeader = "") {
  const values = Object.fromEntries(cookieHeader.split(";").map(v => v.trim()).filter(Boolean).map(v => { const i=v.indexOf("="); return i<0?[v,""]:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]; }));
  return { fbp: values._fbp || undefined, fbc: values._fbc || undefined };
}
