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

export async function verifyCommerceSource(url: string, expectedTitle: string, expectedPriceInr?: number): Promise<CommerceSourceEvidence> {
  const checkedAt = new Date().toISOString();
  const requestedUrl = String(url || "").trim();
  let parsed: URL;
  try {
    parsed = new URL(requestedUrl);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    return { checkedAt, requestedUrl, reachable: false, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: "Invalid source URL" };
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-IN,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; BharatShop-Source-Verifier/1.0; +https://bharatshop-9w4a.onrender.com)",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) return { checkedAt, requestedUrl, finalUrl: response.url, reachable: false, httpStatus: response.status, contentType, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: `Source returned HTTP ${response.status}` };
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return { checkedAt, requestedUrl, finalUrl: response.url, reachable: true, httpStatus: response.status, contentType, titleMatch: false, priceVerified: false, stockVerified: false, shippingVerified: false, error: "Source did not return an HTML commerce page" };

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
      finalUrl: response.url,
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
