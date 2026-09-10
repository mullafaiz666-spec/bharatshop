import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type CommerceSourceEvidence = {
  checkedAt: string;
  requestedUrl: string;
  finalUrl?: string;
  reachable: boolean;
  httpStatus?: number;
  contentType?: string;
  titleMatch: boolean;
  priceVerified: boolean;
  matchedPriceInr?: number;
  stockVerified: boolean;
  stockAvailable?: boolean;
  stockSignal?: string;
  shippingVerified: boolean;
  shippingCostInr?: number;
  shippingSignal?: string;
  error?: string;
};

const STOP = new Set(["with","from","pack","piece","online","india","best","new","the","and","for","buy","sale"]);
const MAX_REDIRECTS = 4;

function tokens(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length >= 4 && !STOP.has(x));
}

function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .slice(0, 500_000);
}

function rupeeValues(text: string) {
  const out: number[] = [];
  const re = /(?:₹|INR|Rs\.?\s*)\s*([0-9][0-9,]*(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && out.length < 100) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) out.push(value);
  }
  return out;
}

function closestPrice(values: number[], expected: number) {
  if (!Number.isFinite(expected) || expected <= 0 || !values.length) return undefined;
  return values.reduce((best, value) => Math.abs(value - expected) < Math.abs((best ?? value) - expected) ? value : best, undefined as number | undefined);
}

function shippingEvidence(text: string) {
  const free = text.match(/\b(free shipping|free delivery|delivery at no extra cost)\b/i);
  if (free) return { verified: true, cost: 0, signal: free[1] };
  const paid = text.match(/\b(?:shipping|delivery)(?:\s+(?:fee|fees|charge|charges|cost))?[^₹]{0,50}(?:₹|INR|Rs\.?\s*)\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  if (paid) {
    const cost = Number(paid[1].replace(/,/g, ""));
    if (Number.isFinite(cost) && cost >= 0) return { verified: true, cost, signal: paid[0].slice(0, 120) };
  }
  return { verified: false };
}

function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function publicIpv6(address: string) {
  const lower = address.toLowerCase().split("%")[0];
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(lower)) return false;
  if (lower.startsWith("2001:db8:")) return false;
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return publicIpv4(mapped[1]);
  return true;
}

function publicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return publicIpv4(address);
  if (family === 6) return publicIpv6(address);
  return false;
}

async function assertPublicCommerceUrl(value: string) {
  const parsed = new URL(value);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  if (parsed.username || parsed.password) throw new Error("credentials in source URL are not allowed");
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  if (!(["80", "443"].includes(port))) throw new Error("non-standard source URL port is not allowed");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("private/local source host is not allowed");
  if (isIP(hostname)) {
    if (!publicAddress(hostname)) throw new Error("private/reserved source address is not allowed");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("source host resolves to a private/reserved address");
  }
  return parsed;
}

async function safeCommerceFetch(initialUrl: string) {
  let current = await assertPublicCommerceUrl(initialUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-IN,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; BharatShop-Source-Verifier/1.0; +https://bharatshop-9w4a.onrender.com)",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current.toString() };
    if (hop === MAX_REDIRECTS) throw new Error("Too many source redirects");
    const location = response.headers.get("location");
    if (!location) throw new Error("Source redirect is missing a location");
    current = await assertPublicCommerceUrl(new URL(location, current).toString());
  }
  throw new Error("Source redirect limit exceeded");
}

export async function verifyCommerceSource(url: string, expectedTitle: string, expectedPriceInr?: number): Promise<CommerceSourceEvidence> {
  const checkedAt = new Date().toISOString();
  const requestedUrl = String(url || "").trim();
  try {
    await assertPublicCommerceUrl(requestedUrl);
  } catch (error) {
    return { checkedAt, requestedUrl, reachable: false, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: error instanceof Error ? error.message : "Invalid source URL" };
  }

  try {
    const { response, finalUrl } = await safeCommerceFetch(requestedUrl);
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) return { checkedAt, requestedUrl, finalUrl, reachable: false, httpStatus: response.status, contentType, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: `Source returned HTTP ${response.status}` };
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return { checkedAt, requestedUrl, finalUrl, reachable: true, httpStatus: response.status, contentType, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: "Source did not return an HTML commerce page" };

    const text = visibleText(await response.text());
    const expectedTokens = tokens(expectedTitle).slice(0, 10);
    const lower = text.toLowerCase();
    const hits = expectedTokens.filter(t => lower.includes(t)).length;
    const requiredHits = expectedTokens.length <= 1 ? expectedTokens.length : Math.min(2, expectedTokens.length);
    const titleMatch = requiredHits > 0 && hits >= requiredHits;

    const prices = rupeeValues(text);
    const closest = closestPrice(prices, Number(expectedPriceInr || 0));
    const priceVerified = Boolean(closest !== undefined && Number(expectedPriceInr) > 0 && Math.abs(Number(closest) - Number(expectedPriceInr)) / Number(expectedPriceInr) <= 0.05);

    const negative = text.match(/\b(out of stock|currently unavailable|sold out|temporarily unavailable|not available for purchase)\b/i);
    const positive = text.match(/\b(in stock|add to cart|buy now|available to order|ships from|dispatch(?:ed)? within)\b/i);
    const stockVerified = Boolean(negative || positive);
    const stockAvailable = negative ? false : positive ? true : undefined;
    const stockSignal = String((negative || positive)?.[1] || "") || undefined;

    const shipping = shippingEvidence(text);
    return {
      checkedAt,
      requestedUrl,
      finalUrl,
      reachable: true,
      httpStatus: response.status,
      contentType,
      titleMatch,
      priceVerified,
      matchedPriceInr: closest,
      stockVerified,
      stockAvailable,
      stockSignal,
      shippingVerified: shipping.verified,
      shippingCostInr: shipping.cost,
      shippingSignal: shipping.signal,
    };
  } catch (error) {
    return { checkedAt, requestedUrl, reachable: false, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: error instanceof Error ? error.message : String(error) };
  }
}
