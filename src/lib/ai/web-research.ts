export type ResearchSource = {
  title: string;
  url: string;
  snippet: string;
  source: "google" | "searxng" | "unknown";
};

export type ResearchResult = {
  query: string;
  sources: ResearchSource[];
  collectedAt: string;
  policy: "public-authorized-only";
};

function asSource(item: any, source: ResearchSource["source"]): ResearchSource | null {
  const title = String(item?.title ?? item?.name ?? "").trim();
  const url = String(item?.url ?? item?.link ?? "").trim();
  const snippet = String(item?.snippet ?? item?.description ?? item?.content ?? "").trim();
  if (!title || !url || !/^https?:\/\//i.test(url)) return null;
  return { title, url, snippet: snippet.slice(0, 2000), source };
}

export async function publicWebResearch(query: string, limit = 10): Promise<ResearchResult> {
  const q = query.trim();
  if (!q) throw new Error("query is required");
  const max = Math.min(Math.max(limit, 1), 20);
  const googleEndpoint = process.env.GOOGLE_RESEARCH_ENDPOINT?.trim();
  const searxngEndpoint = process.env.SEARXNG_URL?.trim();
  let sources: ResearchSource[] = [];

  // GOOGLE_RESEARCH_ENDPOINT must be an authorized search API endpoint owned/configured by BharatShop.
  // We deliberately do not automate raw Google result pages.
  if (googleEndpoint) {
    const url = new URL(googleEndpoint);
    url.searchParams.set("q", q);
    url.searchParams.set("num", String(max));
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Authorized Google research endpoint returned ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.results) ? data.results : [];
    sources = items.map((item: any) => asSource(item, "google")).filter(Boolean) as ResearchSource[];
  }

  if (!sources.length && searxngEndpoint) {
    const url = new URL("/search", searxngEndpoint.endsWith("/") ? searxngEndpoint : `${searxngEndpoint}/`);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`SearXNG research endpoint returned ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data?.results) ? data.results : [];
    sources = items.map((item: any) => asSource(item, "searxng")).filter(Boolean) as ResearchSource[];
  }

  return { query: q, sources: sources.slice(0, max), collectedAt: new Date().toISOString(), policy: "public-authorized-only" };
}

export const DEFAULT_RESEARCH_TOPICS = [
  "India ecommerce product trends and rising demand",
  "India ecommerce competitor pricing and promotions",
  "seasonal shopping trends India",
  "fashion ecommerce trends India",
  "customer pain points and product opportunities ecommerce India",
  "Google Ads ecommerce trends India",
  "Meta ecommerce advertising trends India",
];
