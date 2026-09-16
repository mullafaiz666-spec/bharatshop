export const OPENMONTAGE_REPOSITORY = "https://github.com/calesthio/OpenMontage.git";
export const OPENMONTAGE_PINNED_REVISION = "08e2151fa02de28a5d6a312b3d575692bf147ad7";
export const OPENMONTAGE_LICENSE = "AGPL-3.0";

const truthy = (value: unknown) => /^(1|true|yes|on)$/i.test(String(value || ""));

function clean(value: unknown, max = 500) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function aspectRatio(value: unknown) {
  const normalized = String(value || "9:16");
  return new Set(["9:16", "16:9", "1:1", "4:5"]).has(normalized) ? normalized : "9:16";
}

function duration(value: unknown) {
  const parsed = Number(value || 15);
  if (!Number.isFinite(parsed)) return 15;
  return Math.max(5, Math.min(180, Math.round(parsed)));
}

export type OpenMontagePlanInput = {
  title?: unknown;
  brand?: unknown;
  goal?: unknown;
  audience?: unknown;
  durationSeconds?: unknown;
  aspectRatio?: unknown;
  creativeDirection?: unknown;
  productUrl?: unknown;
  referenceUrl?: unknown;
};

export function openMontageIntegrationMetadata() {
  return {
    status: truthy(process.env.BHARATSHOP_OPENMONTAGE_ENABLED) ? "LOCAL_ENGINE_ENABLED" : "AVAILABLE_DISABLED",
    enabled: truthy(process.env.BHARATSHOP_OPENMONTAGE_ENABLED),
    executionMode: "LOCAL_WORKSTATION_ONLY" as const,
    serverExecutionAllowed: false,
    autoPublish: false,
    autoSpend: false,
    upstream: {
      repository: process.env.OPENMONTAGE_REPO_URL || OPENMONTAGE_REPOSITORY,
      revision: process.env.OPENMONTAGE_REVISION || OPENMONTAGE_PINNED_REVISION,
      license: OPENMONTAGE_LICENSE,
    },
    localCommands: {
      status: "npm run openmontage:status",
      bootstrapPlan: "npm run openmontage:bootstrap",
      createPlan: "npm run openmontage:plan -- --title <product-title>",
      backlotPlan: "npm run openmontage:backlot",
    },
  };
}

export function buildOpenMontagePlan(input: OpenMontagePlanInput) {
  const title = clean(input.title, 120);
  if (!title) throw new Error("title is required");

  const brand = clean(input.brand || "BharatShop", 80) || "BharatShop";
  const goal = clean(input.goal || "short-form product launch film", 220) || "short-form product launch film";
  const audience = clean(input.audience || "Indian ecommerce shoppers", 180) || "Indian ecommerce shoppers";
  const seconds = duration(input.durationSeconds);
  const aspect = aspectRatio(input.aspectRatio);
  const creativeDirection = clean(input.creativeDirection || "premium, original, product-led, social-first", 500);
  const productUrl = clean(input.productUrl, 500);
  const referenceUrl = clean(input.referenceUrl, 500);
  const createdAt = new Date().toISOString();
  const jobId = `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campaign"}`;

  const prompt = [
    `Create a ${seconds}-second ${aspect} ${goal} for ${brand}.`,
    `Product/campaign: ${title}.`,
    `Target audience: ${audience}.`,
    `Creative direction: ${creativeDirection}.`,
    productUrl ? `Product source: ${productUrl}.` : "Use only product assets explicitly supplied by the BharatShop operator.",
    referenceUrl ? `Reference inspiration: ${referenceUrl}.` : "No external reference video was supplied.",
    "Build a hook, scene plan/storyboard, shot list, edit rhythm, captions, audio plan, provider/tool plan, cost estimate, and final render plan.",
    "Use only original, public-domain, or properly licensed media. Do not use third-party logos, copyrighted characters, celebrity likenesses, or misleading endorsements.",
    "Prefer free/local tools when quality is sufficient. Stop before billable generation and before external publishing until the existing BharatShop approval gate authorizes it.",
  ].join("\n");

  return {
    schemaVersion: 1,
    jobId,
    createdAt,
    source: "bharatshop",
    engine: "openmontage",
    upstream: {
      repository: process.env.OPENMONTAGE_REPO_URL || OPENMONTAGE_REPOSITORY,
      revision: process.env.OPENMONTAGE_REVISION || OPENMONTAGE_PINNED_REVISION,
      license: OPENMONTAGE_LICENSE,
    },
    constraints: {
      execution: "local-workstation-only",
      autoPublish: false,
      autoSpend: false,
      originalOrLicensedMediaOnly: true,
      preserveBharatShopApprovalGate: true,
    },
    campaign: {
      title,
      brand,
      goal,
      audience,
      durationSeconds: seconds,
      aspectRatio: aspect,
      creativeDirection,
      productUrl,
      referenceUrl,
    },
    prompt,
  };
}
