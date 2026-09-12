import { randomUUID } from "node:crypto";
import { generateEditorialImage } from "@/lib/fashion/editorial-image";
import { geminiImage } from "@/lib/ai/google-media";
import { runFashionCommand } from "@/lib/ai/fashion-studio";

export type CreativeImageProvider = "auto" | "free" | "google";

export type CreativeImageInput = {
  prompt: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  provider?: CreativeImageProvider;
};

const ASPECTS: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "4:5": [832, 1024],
  "3:4": [768, 1024],
  "16:9": [1024, 576],
  "9:16": [576, 1024],
};

export const BHARATSHOP_CREATIVE_CAPABILITIES = {
  name: "BharatShop Creative Engine",
  version: "1.0.0",
  api: "/api/creative",
  cli: "npm run creative --",
  modes: {
    image: {
      description: "Original text-to-image generation for campaigns, fashion concepts and product artwork.",
      providers: ["free-huggingface", "google-gemini-optional"],
      defaultProviderOrder: ["free-huggingface", "google-gemini-optional"],
      aspectRatios: Object.keys(ASPECTS),
      output: "PNG/JPEG/WebP data URL over API; CLI can save the raster to disk",
    },
    fashion: {
      description: "Refresh original BharatShop Studio/Qikink product views through the existing Fashion Studio policy gate.",
      commands: ["/autoimage", "/catalogmodel", "/colorway", "/lookbook"],
      supplierImageryPolicy: "source-backed supplier images are never replaced by generated lookalikes",
    },
  },
  planned: ["video", "voice", "music", "canvas workflows"],
  policy: {
    freeFirst: true,
    originalCreativeOnly: true,
    destructiveDatabaseActions: false,
  },
} as const;

function dimensions(input: CreativeImageInput) {
  const aspect = ASPECTS[input.aspectRatio || "4:5"] || ASPECTS["4:5"];
  const width = Math.max(512, Math.min(1024, Number(input.width || aspect[0])));
  const height = Math.max(512, Math.min(1280, Number(input.height || aspect[1])));
  return { width, height };
}

function cleanPrompt(value: unknown) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, 4000);
}

function toDataUrl(bytes: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function googleConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

async function freeImage(prompt: string, input: CreativeImageInput) {
  const { width, height } = dimensions(input);
  const image = await generateEditorialImage(prompt, { width, height, seed: input.seed });
  return {
    provider: image.provider,
    mimeType: image.mimeType,
    dataUrl: toDataUrl(image.bytes, image.mimeType),
    source: image.sourceUrl,
    width,
    height,
  };
}

async function googleCreativeImage(prompt: string, input: CreativeImageInput) {
  if (!googleConfigured()) throw new Error("Google image generation is not configured");
  const dataUrl = await geminiImage(prompt, { aspectRatio: input.aspectRatio || "4:5", imageSize: "1K" });
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  const { width, height } = dimensions(input);
  return {
    provider: "google-gemini-image",
    mimeType: match?.[1] || "image/png",
    dataUrl,
    source: "google-gemini",
    width,
    height,
  };
}

export async function createCreativeImage(input: CreativeImageInput) {
  const prompt = cleanPrompt(input.prompt);
  if (!prompt) throw new Error("prompt is required");
  const requested = input.provider || "auto";
  const failures: string[] = [];

  const attempts: Array<() => Promise<Awaited<ReturnType<typeof freeImage>>>> = [];
  if (requested === "google") {
    attempts.push(() => googleCreativeImage(prompt, input));
  } else {
    attempts.push(() => freeImage(prompt, input));
    if (requested === "auto" && googleConfigured()) attempts.push(() => googleCreativeImage(prompt, input));
  }

  for (const attempt of attempts) {
    try {
      const asset = await attempt();
      return {
        id: `bsc_${randomUUID()}`,
        type: "image" as const,
        prompt,
        requestedProvider: requested,
        createdAt: new Date().toISOString(),
        ...asset,
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`BharatShop Creative image generation failed: ${failures.join(" | ").slice(0, 1800)}`);
}

export async function runCreativeFashion(input: {
  command?: string;
  productId?: number;
  productName?: string;
  count?: number;
  extraPrompt?: string;
}) {
  return runFashionCommand({
    command: input.command || "/autoimage",
    productId: input.productId,
    productName: input.productName,
    count: input.count,
    extraPrompt: input.extraPrompt,
  });
}
