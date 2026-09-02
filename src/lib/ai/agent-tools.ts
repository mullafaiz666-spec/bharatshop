type Json = Record<string, unknown>;

type SearchResult = {
  title: string;
  link: string;
  source: string;
  merchant: string;
  price: string;
  extracted_price: number;
  snippet: string;
};

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function searxBase() {
  return requireEnv("SEARXNG_URL").replace(/\/+$/, "");
}

function priceFromText(value: unknown) {
  const text = String(value ?? "");
  const match = text.match(/(?:₹|INR|Rs\.?\s*)\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  if (!match) return 0;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function serpSearch(query: string, engine: "google" | "google_shopping" = "google") {
  // Compatibility name retained for existing agent callers; SerpAPI is no longer used.
  const url = new URL(`${searxBase()}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("categories", "general");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("pageno", "1");
  url.searchParams.set("engines", process.env.SEARXNG_WEB_ENGINES || "bing");
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`SearXNG returned ${r.status}`);
  const data = await r.json() as { results?: Array<Record<string, unknown>> };
  const results: SearchResult[] = (Array.isArray(data.results) ? data.results : []).map((x) => ({
    title: String(x.title || "").trim(),
    link: String(x.url || "").trim(),
    source: String(x.engine || x.pretty_url || "Web source").trim(),
    merchant: String(x.engine || "Web source").trim(),
    price: String(x.content || ""),
    extracted_price: priceFromText(`${x.title || ""} ${x.content || ""}`),
    snippet: String(x.content || "").trim(),
  })).filter(x => x.title && /^https?:\/\//i.test(x.link));
  return {
    // Keep both keys for compatibility with CEO/agent callers. Organic results
    // are the same real SearXNG web results; shopping_results is retained for
    // existing product-research consumers.
    organic_results: results.map(x => ({ title: x.title, link: x.link, snippet: x.snippet, source: x.source })),
    shopping_results: results,
  };
}

export async function openAIJson(instructions: string, input: unknown): Promise<Json> {
  const key = requireEnv("OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions,
      input: typeof input === "string" ? input : JSON.stringify(input),
      text: { format: { type: "json_object" } },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`OpenAI returned ${r.status}`);
  const data = await r.json();
  const text = String(data.output_text || "{}");
  try { return JSON.parse(text) as Json; } catch { throw new Error("OpenAI returned non-JSON agent output"); }
}

export async function openAIText(instructions: string, input: unknown): Promise<string> {
  const key = requireEnv("OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions, input: typeof input === "string" ? input : JSON.stringify(input) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`OpenAI returned ${r.status}`);
  const data = await r.json();
  return String(data.output_text || "").trim();
}
