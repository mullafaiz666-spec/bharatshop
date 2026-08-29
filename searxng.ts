// ─────────────────────────────────────────────────────────────────────────────
// SEARXNG CLIENT — live product image search
// Talks to a self-hosted SearXNG instance (deployed separately, e.g. on Render)
// and returns candidate image results. Callers MUST handle empty/failed results
// and fall back to the static Unsplash pool — this client never throws.
// ─────────────────────────────────────────────────────────────────────────────

export interface SearXNGImageResult {
  url: string; // the image URL itself
  thumbnailUrl?: string;
  sourceUrl?: string; // page the image was found on
  title?: string;
  width?: number;
  height?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;

function getSearxngBaseUrl(): string | null {
  const url = process.env.SEARXNG_URL;
  if (!url) return null;
  return url.replace(/\/+$/, "");
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

/**
 * Query SearXNG's image search category and return normalized results.
 * Returns an empty array (never throws) if the instance is unreachable,
 * misconfigured (JSON output disabled), or returns no usable results.
 */
export async function searxngImageSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<SearXNGImageResult[]> {
  const base = getSearxngBaseUrl();
  if (!base || !query.trim()) return [];

  const limit = opts.limit ?? 6;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const searchUrl = `${base}/search?` + new URLSearchParams({
      q: query,
      categories: "images",
      format: "json",
      safesearch: "1",
    }).toString();

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return [];

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      // SearXNG instance has JSON output format disabled in settings.yml
      return [];
    }

    const data = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
    if (!data?.results?.length) return [];

    const results: SearXNGImageResult[] = [];
    for (const r of data.results) {
      const img = (r.img_src as string) || (r.url as string);
      if (!img || !isLikelyImageUrl(img)) continue;
      results.push({
        url: img,
        thumbnailUrl: (r.thumbnail_src as string) || (r.thumbnail as string) || undefined,
        sourceUrl: (r.url as string) || undefined,
        title: (r.title as string) || undefined,
        width: typeof r.img_width === "number" ? r.img_width : undefined,
        height: typeof r.img_height === "number" ? r.img_height : undefined,
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    // Network error, timeout, abort — instance unreachable. Caller falls back.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function isSearxngConfigured(): boolean {
  return !!getSearxngBaseUrl();
}
