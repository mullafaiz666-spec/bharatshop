import "server-only";

export type Autom8AiWorkflow = "marketing-video" | "fashion-creative";

export type Autom8AiJobInput = {
  workflow: Autom8AiWorkflow;
  source: "marketing-cockpit" | "fashion-designer";
  product?: {
    id?: number;
    title?: string;
    brand?: string;
    category?: string;
    imageUrl?: string;
    sellingPriceInr?: number;
    marketingCopy?: string;
    targetAudience?: string;
  };
  creative: Record<string, unknown>;
};

function configuredUrl() {
  return String(process.env.AUTOM8AI_WEBHOOK_URL || "").trim();
}

function configuredToken() {
  return String(process.env.AUTOM8AI_WEBHOOK_TOKEN || "").trim();
}

export function autom8AiStatus() {
  const url = configuredUrl();
  const token = configuredToken();
  return {
    configured: Boolean(url),
    missing: [
      ...(!url ? ["AUTOM8AI_WEBHOOK_URL"] : []),
    ],
    tokenConfigured: Boolean(token),
    mode: "webhook-orchestration",
    renderer: "external-worker-selected-by-workflow",
    policy: {
      autoPublish: false,
      adSpend: false,
      productMutation: false,
      requiresHumanReview: true,
    },
  };
}

function safeRemoteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function dispatchAutom8AiJob(input: Autom8AiJobInput) {
  const status = autom8AiStatus();
  if (!status.configured) throw new Error(`Autom8AI is not configured: ${status.missing.join(", ")}`);

  const webhookUrl = configuredUrl();
  const parsed = new URL(webhookUrl);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("AUTOM8AI_WEBHOOK_URL must use HTTPS unless it targets localhost");
  }

  const payload = {
    schema: "bharatshop.autom8ai.v1",
    event: input.workflow === "marketing-video" ? "bharatshop.marketing.video.requested" : "bharatshop.fashion.creative.requested",
    requestedAt: new Date().toISOString(),
    source: input.source,
    safety: status.policy,
    renderHints: input.workflow === "marketing-video"
      ? { format: "short-form-product-video", aspectRatios: ["9:16", "1:1"], durationSeconds: [8, 15, 30], preferredRenderer: "Higgsfield-or-configured-video-worker" }
      : { format: "fashion-concept-and-ugc", aspectRatios: ["4:5", "9:16"], preferredRenderer: "Higgsfield-or-configured-creative-worker" },
    product: input.product || null,
    creative: input.creative,
  };

  const token = configuredToken();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "BharatShop-Autom8AI/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(`Autom8AI workflow rejected the job (HTTP ${response.status})`);

  return {
    accepted: true,
    provider: "autom8ai",
    workflow: input.workflow,
    remoteStatus: String(data.status || data.state || "accepted").slice(0, 120),
    remoteJobId: String(data.jobId || data.runId || data.id || "").slice(0, 200) || null,
    assetUrl: safeRemoteUrl(data.assetUrl || data.videoUrl || data.outputUrl),
    workflowUrl: safeRemoteUrl(data.workflowUrl || data.runUrl),
    message: String(data.message || "").slice(0, 500) || null,
    safety: status.policy,
  };
}
