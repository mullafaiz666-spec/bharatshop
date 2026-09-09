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
  const errorBlock = blocks.find((block) => block.includes("event: error"));
  if (errorBlock) {
    const line = errorBlock.split(/\r?\n/).find((x) => x.startsWith("data:"));
    throw new Error(`ZeroGPU generation error${line ? `: ${line.slice(5).trim().slice(0, 500)}` : ""}`);
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

function collectImageRefs(value: unknown): string[] {
  const refs: string[] = [];
  const seen = new Set<unknown>();
  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const value = raw.trim();
    if (!value) return;
    if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(value) || /^https?:\/\//i.test(value) || value.startsWith("/") || /^(?:gradio_api\/)?file=/i.test(value)) refs.push(value);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (typeof node === "string") return add(node);
    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const key of ["url", "path", "image", "value", "data", "file"]) if (key in obj) walk(obj[key], depth + 1);
    for (const [key, item] of Object.entries(obj)) if (!["url", "path", "image", "value", "data", "file"].includes(key)) walk(item, depth + 1);
  };
  walk(value);
  return [...new Set(refs)];
}

function candidateUrls(ref: string, base: string): string[] {
  if (/^data:image\//i.test(ref)) return [ref];
  if (/^https?:\/\//i.test(ref)) return [ref];
  if (/^\/tmp\//i.test(ref) || /^\/var\/tmp\//i.test(ref)) return [`${base}/gradio_api/file=${encodeURIComponent(ref)}`];
  if (ref.startsWith("/gradio_api/")) return [`${base}${ref}`];
  if (ref.startsWith("/file=")) return [`${base}/gradio_api${ref}`, `${base}${ref}`];
  if (/^gradio_api\/file=/i.test(ref)) return [`${base}/${ref}`];
  if (/^file=/i.test(ref)) return [`${base}/gradio_api/${ref}`];
  if (ref.startsWith("/")) return [`${base}${ref}`];
  return [];
}

async function downloadImageFromOutputs(outputs: unknown, base: string): Promise<{ bytes: Buffer; mimeType: string; sourceUrl: string }> {
  const refs = collectImageRefs(outputs);
  const failures: string[] = [];
  for (const ref of refs) {
    if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(ref)) {
      const match = ref.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
      if (!match) continue;
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length >= 10_000 && bytes.length <= 8_000_000) return { bytes, mimeType: match[1].toLowerCase(), sourceUrl: "data:image" };
      continue;
    }
    for (const url of candidateUrls(ref, base)) {
      const timer = withTimeout(30_000);
      try {
        const image = await fetch(url, { headers: authHeaders(), signal: timer.signal, cache: "no-store" });
        if (!image.ok) {
          failures.push(`${url}=>${image.status}`);
          continue;
        }
        const mimeType = String(image.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (!/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) {
          failures.push(`${url}=>${mimeType || "no-content-type"}`);
          continue;
        }
        const bytes = Buffer.from(await image.arrayBuffer());
        if (bytes.length < 10_000 || bytes.length > 8_000_000) {
          failures.push(`${url}=>${bytes.length}bytes`);
          continue;
        }
        return { bytes, mimeType, sourceUrl: url };
      } catch (error) {
        failures.push(`${url}=>${error instanceof Error ? error.message : String(error)}`);
      } finally {
        timer.clear();
      }
    }
  }
  const sample = JSON.stringify(outputs).slice(0, 700);
  throw new Error(`ZeroGPU returned no downloadable raster image; refs=${refs.length}; failures=${failures.slice(0, 5).join(", ")}; output=${sample}`);
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
  const image = await downloadImageFromOutputs(outputs, base);
  return { bytes: image.bytes, mimeType: image.mimeType, provider: "hf-zerogpu-flux1-schnell", sourceUrl: image.sourceUrl, prompt };
}
