// IMAGE SEARCH CLIENT — SearXNG primary, SerpAPI fallback

export interface SearXNGImageResult {
  url: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  title?: string;
  width?: number;
  height?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

function getSearxngBaseUrl(): string | null {
  const url = process.env.SEARXNG_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

function isLikelyImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(u.pathname) || u.hostname.includes("images");
  } catch {
    return false;
  }
}

async function serpApiImageSearch(query: string, limit: number, timeoutMs: number): Promise<SearXNGImageResult[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = "https://serpapi.com/search.json?" + new URLSearchParams({
      engine: "google_images", google_domain: "google.co.in", gl: "in", hl: "en",
      q: query, safe: "active", api_key: key,
    }).toString();
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null) as any;
    const out: SearXNGImageResult[] = [];
    for (const r of data?.images_results || []) {
      const image = String(r.original || r.thumbnail || "");
      if (!image || !isLikelyImageUrl(image)) continue;
      out.push({
        url: image,
        thumbnailUrl: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
        sourceUrl: typeof r.link === "string" ? r.link : undefined,
        title: typeof r.title === "string" ? r.title : undefined,
        width: typeof r.original_width === "number" ? r.original_width : undefined,
        height: typeof r.original_height === "number" ? r.original_height : undefined,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searxngImageSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<SearXNGImageResult[]> {
  if (!query.trim()) return [];
  const limit = opts.limit ?? 6;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = getSearxngBaseUrl();

  if (base) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const searchUrl = `${base}/search?` + new URLSearchParams({
        q: query, categories: "images", format: "json", safesearch: "1",
      }).toString();
      const res = await fetch(searchUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
        const data = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
        const results: SearXNGImageResult[] = [];
        for (const r of data?.results || []) {
          const img = String((r.img_src as string) || (r.url as string) || "");
          if (!img || !isLikelyImageUrl(img)) continue;
          results.push({
            url: img,
            thumbnailUrl: typeof r.thumbnail_src === "string" ? r.thumbnail_src : undefined,
            sourceUrl: typeof r.url === "string" ? r.url : undefined,
            title: typeof r.title === "string" ? r.title : undefined,
            width: typeof r.img_width === "number" ? r.img_width : undefined,
            height: typeof r.img_height === "number" ? r.img_height : undefined,
          });
          if (results.length >= limit) break;
        }
        if (results.length) return results;
      }
    } catch {
      // Fall through to SerpAPI.
    } finally {
      clearTimeout(timeout);
    }
  }

  return serpApiImageSearch(query, limit, timeoutMs);
}

export function isSearxngConfigured(): boolean {
  return !!getSearxngBaseUrl() || !!process.env.SERPAPI_API_KEY;
}
