import { pool } from "@/db";

const API = "https://generativelanguage.googleapis.com/v1";

function key() {
  const value = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!value) throw new Error("GEMINI_API_KEY is not configured");
  return value;
}

async function googleJson(path: string, body: unknown) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Google AI ${response.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

export async function geminiText(prompt: string) {
  const data = await googleJson(`/models/${process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite"}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
  });
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim() || "";
}

export async function geminiImage(prompt: string, options?: { sourceUrl?: string; aspectRatio?: string; imageSize?: string }) {
  const parts: any[] = [{ text: prompt }];
  if (options?.sourceUrl && /^https?:\/\//i.test(options.sourceUrl)) {
    try {
      const source = await fetch(options.sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (source.ok) {
        const mimeType = source.headers.get("content-type") || "image/jpeg";
        const bytes = Buffer.from(await source.arrayBuffer()).toString("base64");
        parts.push({ inlineData: { mimeType, data: bytes } });
      }
    } catch {}
  }
  const data = await googleJson(`/models/${process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image"}:generateContent`, {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      responseFormat: { image: { aspectRatio: options?.aspectRatio || "4:5", imageSize: options?.imageSize || "1K" } },
    },
  });
  const image = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
  if (!image?.data) throw new Error("Google image model returned no image");
  return `data:${image.mimeType || "image/png"};base64,${image.data}`;
}

export async function logGoogleMedia(productId: number | null, action: string, metadata: Record<string, unknown>, status = "SUCCESS") {
  try {
    await pool.query(
      `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'Google Creative Studio',$1,$2,$3,$4)`,
      [action, `${action} ${status.toLowerCase()}`, JSON.stringify({ productId, provider: "google-gemini", ...metadata }), status]
    );
  } catch {}
}
