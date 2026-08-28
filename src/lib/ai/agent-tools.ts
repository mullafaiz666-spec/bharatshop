type Json = Record<string, unknown>;

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function serpSearch(query: string, engine: "google" | "google_shopping" = "google") {
  const key = requireEnv("SERPAPI_API_KEY");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("google_domain", "google.co.in");
  url.searchParams.set("gl", "in");
  url.searchParams.set("hl", "en");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`SerpAPI returned ${r.status}`);
  return r.json();
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
  });
  if (!r.ok) throw new Error(`OpenAI returned ${r.status}`);
  const data = await r.json();
  return String(data.output_text || "").trim();
}
