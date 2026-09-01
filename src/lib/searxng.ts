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

const DEFAULT_TIMEOUT_MS = 10000;

function getSearxngBaseUrl(): string | null {
  const url = process.env.SEARXNG_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

function isCandidateHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function searxngImageSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<SearXNGImageResult[]> {
  if (!query.trim()) return [];
  const limit = opts.limit ?? 6;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = getSearxngBaseUrl();
  if (!base) throw new Error("SEARXNG_URL is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const searchUrl = `${base}/search?` + new URLSearchParams({ q: query, categories: "images", format: "json", safesearch: "1" }).toString();
    const res = await fetch(searchUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
    if (!(res.headers.get("content-type") || "").includes("application/json")) throw new Error("SearXNG returned a non-JSON response");
    const data = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
    const results: SearXNGImageResult[] = [];
    for (const r of data?.results || []) {
      const img = String((r.img_src as string) || (r.url as string) || "");
      if (!img || !isCandidateHttpUrl(img)) continue;
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
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

export function isSearxngConfigured(): boolean {
  return !!getSearxngBaseUrl();
}
