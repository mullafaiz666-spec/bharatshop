type Json = Record<string, unknown>;

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
  url.searchParams.set("categories", engine === "google_shopping" ? "general" : "general");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("pageno", "1");
  const configuredEngines = process.env.SEARXNG_WEB_ENGINES || "bing";
  url.searchParams.set("engines", configuredEngines);
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`SearXNG returned ${r.status}`);
  const data = await r.json() as { results?: Array<Record<string, unknown>> };
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    shopping_results: results.map((x) => ({
      title: String(x.title || "").trim(),
      link: String(x.url || "").trim(),
      source: String(x.engine || x.pretty_url || "Web source").trim(),
      merchant: String(x.engine || "Web source").trim(),
      price: String(x.content || ""),
      extracted_price: priceFromText(`${x.title || ""} ${x.content || ""}`),
      snippet: String(x.content || "").trim(),
    })).filter(x => x.title && /^https?:\/\//i.test(x.link)),
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
