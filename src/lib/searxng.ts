// IMAGE SEARCH CLIENT — SearXNG is the sole image-search provider.
// The media resolver performs the authoritative reachability/content-type gate
// and Claude Vision verification before an image can be published.

export interface SearXNGImageResult {
  url: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  title?: string;
  width?: number;
  height?: number;
}

export class SearXNGRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`SearXNG rate limited (429); retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "SearXNGRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_429_RETRIES = 2;
const RETRY_BASE_MS = 2500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_CONCURRENT_SEARCHES = 1;

const searchCache = new Map<string, { expiresAt: number; results: SearXNGImageResult[]; error?: SearXNGRateLimitError }>();
let activeSearches = 0;
const waiters: Array<() => void> = [];

function getSearxngBaseUrl(): string | null {
  const url = process.env.SEARXNG_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

function configuredImageEngines(): string[] {
  // Keep one upstream by default. A comma/semicolon-separated fallback list can
  // be supplied in production, e.g. "bing images,startpage images". Engines are
  // tried sequentially so a rate-limited upstream never causes parallel hammering.
  return (process.env.SEARXNG_IMAGE_ENGINES || "bing images,startpage images")
    .split(/[,;]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function isCandidateHttpUrl(url: unknown): url is string {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function imageCandidates(result: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const url = String(value || "").trim();
    if (isCandidateHttpUrl(url) && !out.includes(url)) out.push(url);
  };
  add(result.img_src);
  add(result.thumbnail_src);
  add(result.thumbnail);
  const formats = Array.isArray(result.formats) ? result.formats : [];
  for (const format of formats) {
    if (format && typeof format === "object") add((format as Record<string, unknown>).url);
  }
  return out;
}

function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const seconds = Number.parseFloat(String(retryAfter || ""));
  const retryAfterDate = retryAfter && Number.isNaN(seconds) ? Date.parse(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
  if (Number.isFinite(retryAfterDate)) return Math.min(Math.max(0, retryAfterDate - Date.now()), 30000);
  const exponential = RETRY_BASE_MS * 2 ** attempt;
  return Math.min(exponential, 30000) * (0.75 + Math.random() * 0.5);
}

function cacheKey(query: string, limit: number): string {
  return `${query.trim().toLowerCase().replace(/\s+/g, " ")}|${limit}`;
}

function putCache(key: string, value: { results: SearXNGImageResult[]; error?: SearXNGRateLimitError }, ttl: number) {
  while (searchCache.size >= MAX_CACHE_ENTRIES) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(key, { ...value, expiresAt: Date.now() + ttl });
}

async function acquireSlot(): Promise<void> {
  if (activeSearches < MAX_CONCURRENT_SEARCHES) {
    activeSearches += 1;
    return;
  }
  await new Promise<void>(resolve => waiters.push(resolve));
  activeSearches += 1;
}

function releaseSlot() {
  activeSearches = Math.max(0, activeSearches - 1);
  waiters.shift()?.();
}

async function searchEngine(
  base: string,
  query: string,
  limit: number,
  timeoutMs: number,
  engine: string,
): Promise<SearXNGImageResult[]> {
  const searchUrl = `${base}/search?` + new URLSearchParams({
    q: query,
    categories: "images",
    engines: engine,
    format: "json",
    safesearch: "0",
    language: "en",
    pageno: "1",
  }).toString();

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (compatible; BharatShop/1.0; +https://bharatshop-9w4a.onrender.com)",
        },
        cache: "no-store",
      });
      if (res.status === 429) {
        const delay = retryDelayMs(attempt, res.headers.get("retry-after"));
        if (attempt < MAX_429_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new SearXNGRateLimitError(delay);
      }
      if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error("SearXNG returned a non-JSON response");
      const data = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
      const results: SearXNGImageResult[] = [];
      const seen = new Set<string>();
      for (const r of data?.results || []) {
        const candidates = imageCandidates(r);
        if (!candidates.length) continue;
        const url = candidates[0];
        if (seen.has(url)) continue;
        seen.add(url);
        results.push({
          url,
          thumbnailUrl: isCandidateHttpUrl(r.thumbnail_src) ? String(r.thumbnail_src) : (isCandidateHttpUrl(r.thumbnail) ? String(r.thumbnail) : undefined),
          sourceUrl: isCandidateHttpUrl(r.url) ? String(r.url) : undefined,
          title: typeof r.title === "string" ? r.title : undefined,
          width: typeof r.img_width === "number" ? r.img_width : undefined,
          height: typeof r.img_height === "number" ? r.img_height : undefined,
        });
        if (results.length >= limit) break;
      }
      return results;
    } finally {
      clearTimeout(timeout);
    }
  }
  return [];
}

export async function searxngImageSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<SearXNGImageResult[]> {
  if (!query.trim()) return [];
  const limit = Math.max(1, Math.min(12, opts.limit ?? 8));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = getSearxngBaseUrl();
  if (!base) throw new Error("SEARXNG_URL is not configured");

  const key = cacheKey(query, limit);
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.error) throw cached.error;
    return cached.results;
  }
  if (cached) searchCache.delete(key);

  await acquireSlot();
  try {
    let lastRateLimit: SearXNGRateLimitError | undefined;
    for (const engine of configuredImageEngines()) {
      try {
        const results = await searchEngine(base, query, limit, timeoutMs, engine);
        if (results.length) {
          putCache(key, { results }, CACHE_TTL_MS);
          return results;
        }
      } catch (error) {
        if (error instanceof SearXNGRateLimitError) {
          lastRateLimit = error;
          continue;
        }
        // A failed upstream engine should not prevent a configured fallback
        // engine from being attempted.
        continue;
      }
    }
    if (lastRateLimit) {
      putCache(key, { results: [], error: lastRateLimit }, FAILURE_TTL_MS);
      throw lastRateLimit;
    }
    const empty: SearXNGImageResult[] = [];
    putCache(key, { results: empty }, 30 * 1000);
    return empty;
  } finally {
    releaseSlot();
  }
}

export function isSearxngConfigured(): boolean {
  return !!getSearxngBaseUrl();
}
