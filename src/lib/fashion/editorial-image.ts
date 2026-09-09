const DEFAULT_SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";

export type GeneratedEditorial = {
  bytes: Buffer;
  mimeType: string;
  provider: string;
  sourceUrl: string;
  prompt: string;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function authHeaders(): Record<string, string> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseCompleteEvent(text: string): any[] {
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.includes("event: complete")) continue;
    const line = block.split(/\r?\n/).find((x) => x.startsWith("data:"));
    if (!line) continue;
    return JSON.parse(line.slice(5).trim());
  }
  const lastData = text.split(/\r?\n/).reverse().find((x) => x.startsWith("data:"));
  if (lastData) return JSON.parse(lastData.slice(5).trim());
  throw new Error("ZeroGPU returned no complete image event");
}

async function discoverSubmitUrls(base: string): Promise<string[]> {
  const urls = new Set<string>([
    `${base}/gradio_api/call/infer`,
    `${base}/call/infer`,
  ]);

  const timer = withTimeout(10_000);
  try {
    const response = await fetch(`${base}/gradio_api/openapi.json`, {
      headers: { Accept: "application/json", ...authHeaders() },
      signal: timer.signal,
      cache: "no-store",
    });
    if (response.ok) {
      const spec = await response.json().catch(() => ({} as any));
      const paths = spec && typeof spec === "object" && spec.paths && typeof spec.paths === "object" ? Object.keys(spec.paths) : [];
      for (const path of paths) {
        if (!/\/call\//.test(path)) continue;
        if (/\/infer\/?$/i.test(path)) {
          urls.add(path.startsWith("/gradio_api/") ? `${base}${path}` : `${base}/gradio_api${path}`);
        }
      }
    }
  } catch {
    // The documented Gradio route above remains the primary candidate.
  } finally {
    timer.clear();
  }

  return [...urls];
}

async function submitGeneration(base: string, data: unknown[], timeoutMs: number): Promise<{ eventId: string; submitUrl: string }> {
  const candidates = await discoverSubmitUrls(base);
  const failures: string[] = [];

  for (const submitUrl of candidates) {
    const timer = withTimeout(Math.min(30_000, timeoutMs));
    try {
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ data }),
        signal: timer.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        failures.push(`${submitUrl}=>${response.status}`);
        continue;
      }
      const submitted = await response.json().catch(() => ({}));
      const eventId = String((submitted as any)?.event_id || "");
      if (!eventId) {
        failures.push(`${submitUrl}=>no_event_id`);
        continue;
      }
      return { eventId, submitUrl };
    } catch (error) {
      failures.push(`${submitUrl}=>${error instanceof Error ? error.message : String(error)}`);
    } finally {
      timer.clear();
    }
  }

  throw new Error(`ZeroGPU submit failed (${failures.join(", ")})`);
}

export async function generateEditorialImage(prompt: string, options?: { width?: number; height?: number; timeoutMs?: number; seed?: number }): Promise<GeneratedEditorial> {
  const base = String(process.env.FASHION_ZERO_GPU_URL || DEFAULT_SPACE).replace(/\/$/, "");
  const width = Math.max(512, Math.min(1024, Number(options?.width || 768)));
  const height = Math.max(640, Math.min(1280, Number(options?.height || 1024)));
  const timeoutMs = Math.max(30_000, Math.min(180_000, Number(options?.timeoutMs || 110_000)));
  const seed = Number.isFinite(options?.seed) ? Number(options?.seed) : Math.floor(Math.random() * 2_000_000_000);
  const { eventId, submitUrl } = await submitGeneration(base, [prompt, seed, false, width, height, 4], timeoutMs);

  const resultUrl = `${submitUrl}/${encodeURIComponent(eventId)}`;
  const resultTimer = withTimeout(timeoutMs);
  let result: Response;
  try {
    result = await fetch(resultUrl, {
      headers: { Accept: "text/event-stream", ...authHeaders() },
      signal: resultTimer.signal,
      cache: "no-store",
    });
  } finally {
    resultTimer.clear();
  }
  if (!result.ok) throw new Error(`ZeroGPU result HTTP ${result.status}`);
  const outputs = parseCompleteEvent(await result.text());
  const first = outputs?.[0];
  const imageUrl = typeof first === "string" ? first : String(first?.url || first?.path || "");
  const normalizedImageUrl = /^https:\/\//i.test(imageUrl)
    ? imageUrl
    : imageUrl.startsWith("/")
      ? `${base}${imageUrl}`
      : "";
  if (!normalizedImageUrl) throw new Error("ZeroGPU returned no public image URL");

  const imageTimer = withTimeout(30_000);
  let image: Response;
  try {
    image = await fetch(normalizedImageUrl, { headers: authHeaders(), signal: imageTimer.signal, cache: "no-store" });
  } finally {
    imageTimer.clear();
  }
  if (!image.ok) throw new Error(`ZeroGPU image HTTP ${image.status}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length < 10_000) throw new Error(`ZeroGPU image too small (${bytes.length} bytes)`);
  if (bytes.length > 8_000_000) throw new Error(`ZeroGPU image too large (${bytes.length} bytes)`);
  const mimeType = String(image.headers.get("content-type") || "image/webp").split(";")[0];
  if (!/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) throw new Error(`ZeroGPU returned unsupported media type ${mimeType}`);
  return { bytes, mimeType, provider: "hf-zerogpu-flux1-schnell", sourceUrl: normalizedImageUrl, prompt };
}
