// Optional local image generation service. Gemma/Ollama do not generate images.
export async function generateLocalImage(prompt: string, source?: string): Promise<string> {
  const base = process.env.LOCAL_IMAGE_BASE_URL?.replace(/\/+$/, '').replace(/\/v1$/, '');
  if (!base) throw new Error('Local image generation is not configured; no paid provider fallback is permitted');
  const key = process.env.LOCAL_IMAGE_API_KEY;
  const response = await fetch(`${base}/v1/images/generations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: process.env.LOCAL_IMAGE_MODEL, prompt, ...(source ? { reference_image: source } : {}), n: 1, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Local image generation failed (HTTP ${response.status})`);
  const data = await response.json();
  const item = data?.data?.[0];
  if (typeof item?.b64_json === 'string' && item.b64_json.length) return `data:image/png;base64,${item.b64_json}`;
  if (typeof item?.url === 'string' && /^https:\/\//.test(item.url)) return item.url;
  throw new Error('Local image generator returned no image');
}
