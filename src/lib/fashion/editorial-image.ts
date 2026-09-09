const FLUX_SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";
const ZIMAGE_SPACE = "https://mrfakename-z-image-turbo.hf.space";

export type GeneratedEditorial = {
  bytes: Buffer;
  mimeType: string;
  provider: string;
  sourceUrl: string;
  prompt: string;
};

type ProviderSpec = {
  name: string;
  base: string;
  endpointHints: string[];
  data: (prompt: string, seed: number, width: number, height: number) => unknown[];
};

type SubmitCandidate = {
  submitUrl: string;
  resultBaseUrl: string;
  mode: "named" | "data";
  paramNames: string[];
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

function normalizeEndpointName(raw: string) {
  return String(raw || "").replace(/^\/+|\/+$/g, "");
}

export function parseCompleteEvent(text: string): any[] {
  const blocks = text.split(/\r?\n\r?\n+/);
  for (const block of blocks) {
    if (!block.includes("event: complete")) continue;
    const line = block.split(/\r?\n/).find((x) => x.startsWith("data:"));
    if (!line) continue;
    const value = JSON.parse(line.slice(5).trim());
    if (!Array.isArray(value)) throw new Error("Completion did not contain image outputs");
    return value;
  }
  const errorBlock = blocks.find((block) => block.includes("event: error"));
  if (errorBlock) {
    const line = errorBlock.split(/\r?\n/).find((x) => x.startsWith("data:"));
    const detail = line ? line.slice(5).trim().slice(0, 500) : "unknown";
    throw new Error(`Generation failed; no image was produced: ${detail}`);
  }
  throw new Error("generation returned no complete event");
}

function paramNamesFromSchema(pathItem: any): string[] {
  const schema = pathItem?.post?.requestBody?.content?.["application/json"]?.schema;
  const props = schema?.properties && typeof schema.properties === "object" ? Object.keys(schema.properties) : [];
  return props.filter((name) => !["event_id", "session_hash"].includes(name));
}

function candidateKey(candidate: SubmitCandidate) {
  return `${candidate.submitUrl}|${candidate.mode}|${candidate.paramNames.join(",")}`;
}

async function discoverSubmitCandidates(spec: ProviderSpec, signal: AbortSignal): Promise<SubmitCandidate[]> {
  const candidates: SubmitCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: SubmitCandidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const openapiTimer = withTimeout(12_000);
  try {
    const response = await fetch(`${spec.base}/gradio_api/openapi.json`, {
      headers: { Accept: "application/json", ...authHeaders() },
      signal: AbortSignal.any([openapiTimer.signal, signal]),
      cache: "no-store",
    });
    if (response.ok) {
      const doc = await response.json().catch(() => ({} as any));
      const paths = doc && typeof doc === "object" && doc.paths && typeof doc.paths === "object" ? doc.paths : {};
      for (const [path, pathItem] of Object.entries(paths as Record<string, any>)) {
        const match = path.match(/^\/gradio_api\/call\/v2\/([^/{]+)\/?$/i);
        if (!match || !pathItem?.post) continue;
        const endpoint = normalizeEndpointName(match[1]);
        if (!endpoint) continue;
        const names = paramNamesFromSchema(pathItem);
        add({ submitUrl: `${spec.base}${path}`, resultBaseUrl: `${spec.base}/gradio_api/call/${endpoint}`, mode: names.length ? "named" : "data", paramNames: names });
      }
    }
  } catch {
    // /info and compatibility routes below remain available.
  } finally {
    openapiTimer.clear();
  }

  const infoTimer = withTimeout(12_000);
  try {
    const response = await fetch(`${spec.base}/gradio_api/info`, {
      headers: { Accept: "application/json", ...authHeaders() },
      signal: AbortSignal.any([infoTimer.signal, signal]),
      cache: "no-store",
    });
    if (response.ok) {
      const info = await response.json().catch(() => ({} as any));
      for (const collection of [info?.named_endpoints, info?.unnamed_endpoints]) {
        if (!collection || typeof collection !== "object") continue;
        for (const [rawName, definition] of Object.entries(collection as Record<string, any>)) {
          const endpoint = normalizeEndpointName(rawName);
          if (!endpoint) continue;
          const params = Array.isArray(definition?.parameters) ? definition.parameters : [];
          const names = params.map((p: any) => String(p?.parameter_name || p?.name || "").trim()).filter(Boolean);
          add({ submitUrl: `${spec.base}/gradio_api/call/${endpoint}`, resultBaseUrl: `${spec.base}/gradio_api/call/${endpoint}`, mode: "data", paramNames: names });
        }
      }
    }
  } catch {
    // Hard-coded hints below cover the two maintained free Spaces.
  } finally {
    infoTimer.clear();
  }

  for (const endpoint of [...spec.endpointHints, "predict"]) {
    const name = normalizeEndpointName(endpoint);
    if (!name) continue;
    add({ submitUrl: `${spec.base}/gradio_api/call/${name}`, resultBaseUrl: `${spec.base}/gradio_api/call/${name}`, mode: "data", paramNames: [] });
  }
  return candidates;
}

function requestBody(candidate: SubmitCandidate, data: unknown[]) {
  if (candidate.mode !== "named" || !candidate.paramNames.length) return { data };
  const body: Record<string, unknown> = {};
  candidate.paramNames.forEach((name, index) => {
    if (index < data.length) body[name] = data[index];
  });
  return body;
}

async function submitGeneration(spec: ProviderSpec, data: unknown[], timeoutMs: number, signal: AbortSignal): Promise<{ eventId: string; resultBaseUrl: string }> {
  const candidates = await discoverSubmitCandidates(spec, signal);
  const failures: string[] = [];
  for (const candidate of candidates) {
    const timer = withTimeout(Math.min(30_000, timeoutMs));
    try {
      const response = await fetch(candidate.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(requestBody(candidate, data)),
        signal: AbortSignal.any([timer.signal, signal]),
        cache: "no-store",
      });
      if (!response.ok) {
        failures.push(`${candidate.submitUrl}=>${response.status}`);
        continue;
      }
      const submitted = await response.json().catch(() => ({}));
      const eventId = String((submitted as any)?.event_id || "");
      if (!eventId) {
        failures.push(`${candidate.submitUrl}=>no_event_id`);
        continue;
      }
      return { eventId, resultBaseUrl: candidate.resultBaseUrl };
    } catch (error) {
      failures.push(`${candidate.submitUrl}=>${error instanceof Error ? error.message : String(error)}`);
    } finally {
      timer.clear();
    }
  }
  throw new Error(`submit failed (${failures.slice(0, 10).join(", ")})`);
}

function collectImageRefs(value: unknown): string[] {
  const refs: string[] = [];
  const seen = new Set<unknown>();
  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const v = raw.trim();
    if (!v) return;
    if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(v) || /^https?:\/\//i.test(v) || v.startsWith("/") || /^(?:gradio_api\/)?file=/i.test(v)) refs.push(v);
  };
  const walk = (node: unknown, depth = 0) => {
    if (depth > 7 || node == null) return;
    if (typeof node === "string") return add(node);
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const item of Object.values(node as Record<string, unknown>)) walk(item, depth + 1);
  };
  walk(value);
  return [...new Set(refs)];
}

function candidateUrls(ref: string, base: string): string[] {
  if (/^data:image\//i.test(ref) || /^https?:\/\//i.test(ref)) return [ref];
  if (/^\/tmp\//i.test(ref) || /^\/var\/tmp\//i.test(ref)) return [`${base}/gradio_api/file=${encodeURIComponent(ref)}`];
  if (ref.startsWith("/gradio_api/")) return [`${base}${ref}`];
  if (ref.startsWith("/file=")) return [`${base}/gradio_api${ref}`, `${base}${ref}`];
  if (/^gradio_api\/file=/i.test(ref)) return [`${base}/${ref}`];
  if (/^file=/i.test(ref)) return [`${base}/gradio_api/${ref}`];
  if (ref.startsWith("/")) return [`${base}${ref}`];
  return [];
}

async function downloadImage(outputs: unknown, base: string, signal: AbortSignal): Promise<{ bytes: Buffer; mimeType: string; sourceUrl: string }> {
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
        const response = await fetch(url, { headers: new URL(url).origin === new URL(base).origin ? authHeaders() : {}, signal: AbortSignal.any([timer.signal, signal]), cache: "no-store" });
        if (!response.ok) {
          failures.push(`${url}=>${response.status}`);
          continue;
        }
        const mimeType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (!/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) {
          failures.push(`${url}=>${mimeType || "no-content-type"}`);
          continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
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
  throw new Error(`no raster image; refs=${refs.length}; failures=${failures.slice(0, 5).join(", ")}`);
}

async function runProvider(spec: ProviderSpec, prompt: string, seed: number, width: number, height: number, timeoutMs: number, signal: AbortSignal): Promise<GeneratedEditorial> {
  const { eventId, resultBaseUrl } = await submitGeneration(spec, spec.data(prompt, seed, width, height), timeoutMs, signal);
  const resultUrl = `${resultBaseUrl}/${encodeURIComponent(eventId)}`;
  const timer = withTimeout(timeoutMs);
  let outputs: any[];
  try {
    const response = await fetch(resultUrl, { headers: { Accept: "text/event-stream", ...authHeaders() }, signal: AbortSignal.any([timer.signal, signal]), cache: "no-store" });
    if (!response.ok) throw new Error(`result HTTP ${response.status}`);
    outputs = parseCompleteEvent(await response.text());
  } finally {
    timer.clear();
  }
  const image = await downloadImage(outputs, spec.base, signal);
  return { bytes: image.bytes, mimeType: image.mimeType, provider: spec.name, sourceUrl: image.sourceUrl, prompt };
}

export async function generateEditorialImage(prompt: string, options?: { width?: number; height?: number; timeoutMs?: number; seed?: number }): Promise<GeneratedEditorial> {
  const width = Math.max(512, Math.min(1024, Math.round(Number(options?.width || 768) / 64) * 64));
  const height = Math.max(640, Math.min(1280, Math.round(Number(options?.height || 1024) / 64) * 64));
  const timeoutMs = Math.max(30_000, Math.min(180_000, Number(options?.timeoutMs || 110_000)));
  const seed = Number.isFinite(options?.seed) ? Number(options?.seed) : Math.floor(Math.random() * 2_000_000_000);
  const custom = String(process.env.FASHION_ZERO_GPU_URL || "").trim().replace(/\/$/, "");
  const providers: ProviderSpec[] = [];
  if (custom) {
    providers.push({ name: "hf-zerogpu-custom", base: custom, endpointHints: ["infer", "generate_image"], data: (p, s, w, h) => [p, s, false, w, h, 4] });
  }
  providers.push(
    { name: "hf-zerogpu-flux1-schnell", base: FLUX_SPACE, endpointHints: ["infer"], data: (p, s, w, h) => [p, s, false, w, h, 4] },
    { name: "hf-zerogpu-zimage-turbo", base: ZIMAGE_SPACE, endpointHints: ["generate_image"], data: (p, s, w, h) => [p, h, w, 9, s, false] },
  );

  const unique = providers.filter((provider, index, all) => all.findIndex((x) => x.base === provider.base) === index);
  const failures: string[] = [];
  const signal = AbortSignal.timeout(timeoutMs);
  for (const provider of unique) {
    if (signal.aborted) break;
    try {
      return await runProvider(provider, prompt, seed, width, height, timeoutMs, signal);
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const authMode = authHeaders().Authorization ? "authenticated" : "anonymous";
  throw new Error(`All free editorial generators unavailable (${authMode}); ${failures.join(" | ").slice(0, 1800)}`);
}
