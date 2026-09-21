import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type PublicResearchEvidence = {
  source: "PERPLEXITY";
  sourceUrl: string;
  topic: string;
  title: string;
  snippet: string;
  metric: string;
  observedAt: string | null;
  fetchedAt: string;
  evidenceHash: string;
};

export type PublicResearchResult = {
  provider: string;
  status: string;
  answer?: string;
  citations?: string[];
  organic?: Array<Record<string, unknown>>;
  shopping?: Array<Record<string, unknown>>;
  evidence?: PublicResearchEvidence[];
  providerRoute?: Record<string, unknown>;
};

type ResearchOptions = { signal?: AbortSignal };

export class PerplexityResearchError extends Error {
  code: "NOT_CONFIGURED" | "PRIVACY_BLOCKED" | "TIMEOUT" | "CANCELLED" | "RATE_LIMITED" | "MALFORMED_RESPONSE" | "UNAVAILABLE";
  constructor(code: PerplexityResearchError["code"], message: string) {
    super(message);
    this.name = "PerplexityResearchError";
    this.code = code;
  }
}

const endpoint = "https://api.perplexity.ai/v1/sonar";
const apiKey = () => String(process.env.PERPLEXITY_API_KEY || "").trim();
const model = () => String(process.env.PERPLEXITY_MODEL || "sonar").trim() || "sonar";
const timeoutMs = () => Math.max(2_000, Math.min(30_000, Number(process.env.PERPLEXITY_TIMEOUT_MS || 15_000)));
const maxRetryDelayMs = () => Math.max(0, Math.min(5_000, Number(process.env.PERPLEXITY_MAX_RETRY_DELAY_MS || 2_000)));

function privateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

function privateIpv6(host: string) {
  const normalized = host.toLowerCase();
  return normalized === "::1"
    || normalized === "::"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized);
}

function privateHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  const kind = isIP(host);
  return kind === 4 ? privateIpv4(host) : kind === 6 ? privateIpv6(host) : false;
}

function containsPrivateUrl(text: string) {
  if (/\b(?:file|ssh|postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?)\s*:\/\//i.test(text)) return true;
  const matches = text.match(/https?:\/\/[^\s<>"')\]}]+/gi) || [];
  for (const raw of matches) {
    try {
      const url = new URL(raw);
      if (url.username || url.password || privateHost(url.hostname)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

const sensitivePatterns: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:password|passcode|secret|client_secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|bearer)\b\s*[:=]?\s*\S+/i,
  /\b(?:DATABASE_URL|SOURCE_DATABASE_URL|SUPABASE_DB_URL|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|CASHFREE_SECRET_KEY|CASHFREE_WEBHOOK_SECRET|ADMIN_SESSION_SECRET|BHARATSHOP_AUTOMATION_TOKEN)\b/i,
  /\b(?:razorpay_payment_id|razorpay_order_id|cf_payment_id|payment_session_id|order[_ -]?(?:id|ref))\b\s*[:=]?\s*\S+/i,
  /\bBS-WEB-[A-Za-z0-9_-]{8,}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/,
  /\b(?:customer|buyer)\s*(?:name|email|phone|mobile|address)\b\s*[:=]\s*\S+/i,
  /\b(?:card|pan)\s*(?:number|no)?\b\s*[:=]?\s*(?:\d[ -]?){12,19}\b/i,
];

export function assertPublicResearchQuery(value: unknown) {
  const query = String(value || "").replace(/\s+/g, " ").trim();
  if (query.length < 3 || query.length > 600) throw new PerplexityResearchError("PRIVACY_BLOCKED", "Research query is invalid or outside the allowed public-research size.");
  if (containsPrivateUrl(query) || sensitivePatterns.some((pattern) => pattern.test(query))) {
    throw new PerplexityResearchError("PRIVACY_BLOCKED", "Sensitive or private context cannot be sent to an external research provider.");
  }
  return query;
}

function retryDelay(header: string | null) {
  const value = String(header || "").trim();
  if (!value) return 250;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxRetryDelayMs());
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), maxRetryDelayMs()) : 250;
}

function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new PerplexityResearchError("CANCELLED", "External research request was cancelled."));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function fetchAttempt(body: unknown, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs());
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new PerplexityResearchError("CANCELLED", "External research request was cancelled.");
    if (controller.signal.aborted) throw new PerplexityResearchError("TIMEOUT", "Perplexity research timed out.");
    throw new PerplexityResearchError("UNAVAILABLE", "Perplexity research is temporarily unavailable.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function validPublicUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !privateHost(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function evidenceHash(sourceUrl: string, title: string, fetchedAt: string) {
  return createHash("sha256").update(`PERPLEXITY\n${sourceUrl}\n${title}\n${fetchedAt}`).digest("hex");
}

function normalizePayload(query: string, payload: any): PublicResearchResult {
  const answer = String(payload?.choices?.[0]?.message?.content || "").trim();
  const fetchedAt = new Date().toISOString();
  const rows = Array.isArray(payload?.search_results) ? payload.search_results : [];
  const citations = Array.from(new Set((Array.isArray(payload?.citations) ? payload.citations : []).map(validPublicUrl).filter(Boolean)));
  const organic = rows.map((item: any) => ({
    title: String(item?.title || item?.url || "Perplexity source").trim(),
    link: validPublicUrl(item?.url),
    snippet: String(item?.snippet || "").trim(),
    source: String(item?.source || "web").trim() || "web",
    date: item?.date ? String(item.date) : undefined,
    lastUpdated: item?.last_updated ? String(item.last_updated) : undefined,
  })).filter((item: any) => item.link);
  const known = new Set(organic.map((item: any) => item.link));
  for (const url of citations) {
    if (!known.has(url)) organic.push({ title: new URL(url).hostname, link: url, snippet: "", source: "citation" });
  }
  if (!answer && organic.length === 0) throw new PerplexityResearchError("MALFORMED_RESPONSE", "Perplexity returned no usable answer or sources.");
  const evidence = organic.map((item: any) => ({
    source: "PERPLEXITY" as const,
    sourceUrl: item.link,
    topic: query,
    title: item.title,
    snippet: item.snippet,
    metric: "",
    observedAt: item.date && !Number.isNaN(Date.parse(item.date)) ? new Date(item.date).toISOString() : null,
    fetchedAt,
    evidenceHash: evidenceHash(item.link, item.title, fetchedAt),
  }));
  return {
    provider: "perplexity",
    status: "OK",
    answer,
    citations,
    organic,
    shopping: [],
    evidence,
    providerRoute: { primary: "perplexity", active: "perplexity", fallbackUsed: false },
  };
}

export function perplexityReadiness() {
  const configured = Boolean(apiKey());
  return {
    provider: "perplexity",
    configured,
    ready: configured,
    required: false,
    exercised: false,
    status: configured ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED",
    model: model(),
    reason: configured
      ? "server-side key configured; no paid health probe is executed automatically"
      : "PERPLEXITY_API_KEY is not configured; existing research provider chain remains active",
  };
}

export async function perplexityResearch(queryInput: unknown, options: ResearchOptions = {}): Promise<PublicResearchResult> {
  const query = assertPublicResearchQuery(queryInput);
  if (!apiKey()) throw new PerplexityResearchError("NOT_CONFIGURED", "Perplexity is not configured.");
  const body = {
    model: model(),
    messages: [
      { role: "system", content: "Research current public web information only. Preserve factual uncertainty and rely on cited sources. Do not infer private BharatShop, customer, order, payment, credential, database or local-network facts." },
      { role: "user", content: query },
    ],
    temperature: 0.1,
    max_tokens: 900,
    web_search_options: { search_mode: "web", return_images: false, return_related_questions: false },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchAttempt(body, options.signal);
    if (response.status === 429) {
      const delay = retryDelay(response.headers.get("retry-after"));
      await response.body?.cancel().catch(() => undefined);
      if (attempt === 0) { await sleep(delay, options.signal); continue; }
      throw new PerplexityResearchError("RATE_LIMITED", "Perplexity rate limit reached.");
    }
    if (response.status === 408 || response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      if (attempt === 0) { await sleep(250, options.signal); continue; }
      throw new PerplexityResearchError("UNAVAILABLE", "Perplexity research is temporarily unavailable.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PerplexityResearchError("UNAVAILABLE", `Perplexity research request was rejected (HTTP ${response.status}).`);
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PerplexityResearchError("MALFORMED_RESPONSE", "Perplexity returned malformed JSON."); }
    return normalizePayload(query, payload);
  }
  throw new PerplexityResearchError("UNAVAILABLE", "Perplexity research is temporarily unavailable.");
}

export async function researchWithOptionalPerplexity(
  queryInput: unknown,
  fallback: (query: string) => Promise<PublicResearchResult>,
  options: ResearchOptions = {},
): Promise<PublicResearchResult> {
  const query = assertPublicResearchQuery(queryInput);
  if (!apiKey()) {
    const result = await fallback(query);
    return { ...result, providerRoute: { primary: "perplexity", primaryStatus: "NOT_CONFIGURED", active: result.provider, fallbackUsed: true } };
  }
  try {
    return await perplexityResearch(query, options);
  } catch (error) {
    const code = error instanceof PerplexityResearchError ? error.code : "UNAVAILABLE";
    if (code === "PRIVACY_BLOCKED" || code === "CANCELLED") throw error;
    const result = await fallback(query);
    return { ...result, providerRoute: { primary: "perplexity", primaryStatus: code, active: result.provider, fallbackUsed: true } };
  }
}
