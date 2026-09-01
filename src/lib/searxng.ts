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

const DEFAULT_TIMEOUT_MS = 15000;

function getSearxngBaseUrl(): string | null {
  const url = process.env.SEARXNG_URL;
  return url ? url.replace(/\/+$/, "") : null;
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
  // SearXNG image results normally expose img_src. Keep the alternate fields
  // because different engines can populate thumbnail_src/thumbnail/formats.
  add(result.img_src);
  add(result.thumbnail_src);
  add(result.thumbnail);
  const formats = Array.isArray(result.formats) ? result.formats : [];
  for (const format of formats) {
    if (format && typeof format === "object") add((format as Record<string, unknown>).url);
  }
  return out;
}

export async function searxngImageSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<SearXNGImageResult[]> {
  if (!query.trim()) return [];
  const limit = opts.limit ?? 8;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = getSearxngBaseUrl();
  if (!base) throw new Error("SEARXNG_URL is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const searchUrl = `${base}/search?` + new URLSearchParams({
      q: query,
      categories: "images",
      format: "json",
      safesearch: "0",
      language: "en",
      pageno: "1",
    }).toString();
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
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

export function isSearxngConfigured(): boolean {
  return !!getSearxngBaseUrl();
}
