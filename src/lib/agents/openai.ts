type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

export async function runOpenAI(messages: OpenAIMessage[], options: { model?: string; temperature?: number } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini", messages, temperature: options.temperature ?? 0.3 }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

export async function runStructured<T>(system: string, user: string): Promise<T> {
  const text = await runOpenAI([
    { role: "system", content: `${system}\nReturn ONLY valid JSON. No markdown fences.` },
    { role: "user", content: user },
  ]);
  return JSON.parse(text) as T;
}
