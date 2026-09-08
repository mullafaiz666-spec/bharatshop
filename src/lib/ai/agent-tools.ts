import { runStructured, runText } from "@/lib/ai/provider";

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

let nextSearchAt = 0;
let searchQueue: Promise<void> = Promise.resolve();

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

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function acquireSearchSlot() {
  const previous = searchQueue;
  let release!: () => void;
  searchQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const minGap = Math.max(1000, Number(process.env.SEARXNG_MIN_REQUEST_GAP_MS || 4000));
  const wait = Math.max(0, nextSearchAt - Date.now());
  if (wait) await sleep(wait);
  nextSearchAt = Date.now() + minGap;
  return release;
}

function retryDelay(attempt: number, header: string | null) {
  const parsed = Number(header);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed * 1000, 60000);
  return Math.min(5000 * 2 ** attempt, 60000);
}

export async function serpSearch(query: string, engine: "google" | "google_shopping" = "google") {
  const release = await acquireSearchSlot();
  try {
    const url = new URL(`${searxBase()}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("categories", "general");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", "en");
    url.searchParams.set("pageno", "1");
    url.searchParams.set("engines", process.env.SEARXNG_WEB_ENGINES || "bing");

    let response: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "application/json", "User-Agent": "BharatShop/1.0" },
      });
      if (response.status !== 429) break;
      const delay = retryDelay(attempt, response.headers.get("retry-after"));
      nextSearchAt = Math.max(nextSearchAt, Date.now() + delay);
      if (attempt < 3) await sleep(delay);
    }

    if (!response) throw new Error("SearXNG returned no response");
    if (!response.ok) throw new Error(`SearXNG returned ${response.status}`);
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
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
      organic_results: results.map(x => ({ title: x.title, link: x.link, snippet: x.snippet, source: x.source })),
      shopping_results: results,
      requestedEngine: engine,
    };
  } finally {
    release();
  }
}

// Legacy names retained so existing agents do not need a broad rewrite. These
// now use BharatShop's configured local Gemma provider instead of paid OpenAI.
export async function openAIJson(instructions: string, input: unknown): Promise<Json> {
  return runStructured<Json>(instructions, typeof input === "string" ? input : JSON.stringify(input));
}

export async function openAIText(instructions: string, input: unknown): Promise<string> {
  const result = await runText([
    { role: "system", content: instructions },
    { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
  ], { temperature: 0.2, maxTokens: 2048 });
  return result.content.trim();
}
