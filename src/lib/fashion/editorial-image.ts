import { Client } from "@gradio/client";

export type GeneratedEditorial = {
  bytes: Buffer;
  mimeType: string;
  provider: string;
  sourceUrl: string;
  prompt: string;
};

type ProviderSpec = {
  name: string;
  source: string;
  endpoint: string;
  payload: (prompt: string, seed: number, width: number, height: number) => Record<string, unknown>;
};

function hfToken() {
  return String(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "").trim();
}

function collectImageRefs(value: unknown): string[] {
  const refs: string[] = [];
  const seen = new Set<unknown>();
  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const v = raw.trim();
    if (!v) return;
    if (/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(v) || /^https?:\/\//i.test(v)) refs.push(v);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (typeof node === "string") return add(node);
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (["url", "path", "src"].includes(key.toLowerCase())) add(item);
      walk(item, depth + 1);
    }
  };
  walk(value);
  return [...new Set(refs)];
}

async function downloadImage(outputs: unknown, timeoutMs: number) {
  const refs = collectImageRefs(outputs);
  const failures: string[] = [];
  for (const ref of refs) {
    const data = ref.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
    if (data) {
      const bytes = Buffer.from(data[2], "base64");
      const mimeType = data[1].toLowerCase().replace("image/jpg", "image/jpeg");
      if (bytes.length >= 12_000 && bytes.length <= 12_000_000) return { bytes, mimeType, sourceUrl: "data:image" };
      continue;
    }
    if (!/^https?:\/\//i.test(ref)) continue;
    try {
      const response = await fetch(ref, { cache: "no-store", signal: AbortSignal.timeout(Math.min(45_000, timeoutMs)) });
      if (!response.ok) {
        failures.push(`${new URL(ref).hostname}:${response.status}`);
        continue;
      }
      const mimeType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase().replace("image/jpg", "image/jpeg");
      if (!/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) {
        failures.push(`${new URL(ref).hostname}:${mimeType || "no-content-type"}`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 12_000 || bytes.length > 12_000_000) {
        failures.push(`${new URL(ref).hostname}:${bytes.length}bytes`);
        continue;
      }
      return { bytes, mimeType, sourceUrl: ref };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Gradio returned no usable raster image; refs=${refs.length}; ${failures.slice(0, 5).join(" | ")}`);
}

async function runProvider(spec: ProviderSpec, prompt: string, seed: number, width: number, height: number, timeoutMs: number): Promise<GeneratedEditorial> {
  const token = hfToken();
  const connectPromise = Client.connect(spec.source, token ? ({ hf_token: token } as any) : undefined);
  const client = await Promise.race([
    connectPromise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${spec.name} connection timeout`)), Math.min(30_000, timeoutMs))),
  ]);
  const prediction = await Promise.race([
    client.predict(spec.endpoint, spec.payload(prompt, seed, width, height)),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${spec.name} generation timeout`)), timeoutMs)),
  ]);
  const outputs = (prediction as any)?.data ?? prediction;
  const image = await downloadImage(outputs, timeoutMs);
  return { ...image, provider: spec.name, prompt };
}

export async function generateEditorialImage(prompt: string, options?: { width?: number; height?: number; timeoutMs?: number; seed?: number }): Promise<GeneratedEditorial> {
  const width = Math.max(640, Math.min(1024, Math.round(Number(options?.width || 768) / 64) * 64));
  const height = Math.max(768, Math.min(1280, Math.round(Number(options?.height || 1024) / 64) * 64));
  const timeoutMs = Math.max(45_000, Math.min(180_000, Number(options?.timeoutMs || 120_000)));
  const seed = Number.isFinite(options?.seed) ? Number(options?.seed) : Math.floor(Math.random() * 2_000_000_000);
  const providers: ProviderSpec[] = [];
  const custom = String(process.env.FASHION_ZERO_GPU_URL || "").trim();
  if (custom) {
    providers.push({
      name: "hf-zerogpu-custom",
      source: custom,
      endpoint: String(process.env.FASHION_ZERO_GPU_ENDPOINT || "/infer"),
      payload: (p, s, w, h) => ({ prompt: p, seed: s, randomize_seed: false, width: w, height: h, num_inference_steps: 6 }),
    });
  }
  providers.push(
    {
      name: "hf-zerogpu-zimage-turbo",
      source: "mrfakename/Z-Image-Turbo",
      endpoint: "/generate_image",
      payload: (p, s, w, h) => ({ prompt: p, height: h, width: w, num_inference_steps: 9, seed: s, randomize_seed: false }),
    },
    {
      name: "hf-zerogpu-flux1-schnell",
      source: "black-forest-labs/FLUX.1-schnell",
      endpoint: "/infer",
      payload: (p, s, w, h) => ({ prompt: p, seed: s, randomize_seed: false, width: w, height: h, num_inference_steps: 6 }),
    },
  );

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await runProvider(provider, prompt, seed, width, height, timeoutMs);
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`All configured photoreal generators failed (${hfToken() ? "HF authenticated" : "anonymous HF quota"}): ${failures.join(" | ").slice(0, 2200)}`);
}
