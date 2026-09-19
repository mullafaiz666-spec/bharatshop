import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiActivityLogs, productDetails, productImages, products } from "@/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { autom8AiStatus, dispatchAutom8AiJob } from "@/lib/autom8ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function tokenAuthorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-automation-token") || "";
  return supplied === expected;
}

async function authorized(req: Request) {
  if (tokenAuthorized(req)) return true;
  try { return Boolean(await getAdminUser()); } catch { return false; }
}

function specsOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 1200) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    status: autom8AiStatus(),
    workflows: {
      marketingVideo: "Creates a review-only short-form product-video job for Autom8AI orchestration.",
      fashionCreative: "Creates a review-only BharatDrip/Qikink creative job after local IP/economics gates.",
    },
    rendererContract: "Autom8AI orchestrates the workflow; the configured external renderer (for example Higgsfield) produces media.",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40).toLowerCase();
    const productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Valid productId is required" }, { status: 400 });
    }

    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const [details] = await db.select().from(productDetails).where(eq(productDetails.productId, product.id)).limit(1);
    const specs = specsOf(details?.specificationsJson);
    const images = await db.select().from(productImages).where(and(eq(productImages.productId, product.id), eq(productImages.verificationStatus, "AI_GENERATED_ORIGINAL")));
    const imageUrls = Array.from(new Set([product.imageUrl, ...images.map((image) => image.imageUrl)].filter(Boolean))).slice(0, 8);

    if (action === "marketing-video") {
      if (product.status !== "Published" || Number(product.netProfitInr) <= 0) {
        return NextResponse.json({ error: "Marketing video requires a Published profitable product" }, { status: 422 });
      }
      const result = await dispatchAutom8AiJob({
        workflow: "marketing-video",
        source: "marketing-cockpit",
        product: {
          id: product.id,
          title: product.title,
          brand: product.brand,
          category: product.category,
          imageUrl: product.imageUrl,
          sellingPriceInr: Number(product.sellingPriceInr),
          marketingCopy: product.aiMarketingCopy,
          targetAudience: product.aiTargetAudience,
        },
        creative: {
          objective: clean(body.objective, 1200) || "Generate a conversion-focused short product video for Instagram Reels and paid social review.",
          platforms: Array.isArray(body.platforms) ? body.platforms.map((value: unknown) => clean(value, 80)).filter(Boolean).slice(0, 8) : ["Instagram Reels"],
          imageUrls,
          hook: clean(body.hook, 300),
          cta: clean(body.cta, 120) || "Shop now",
          brandSafety: "Use only supplied/verified product imagery and original creative. Do not imply fake testimonials or unsupported claims.",
        },
      });
      await db.insert(aiActivityLogs).values({
        userId: product.userId,
        agentName: "Marketing Video Orchestrator",
        actionType: "AUTOM8AI_MARKETING_VIDEO_QUEUED",
        message: `Autom8AI review-only marketing-video job queued for ${product.title}.`,
        metadataJson: { productId: product.id, remoteJobId: result.remoteJobId, remoteStatus: result.remoteStatus, safety: result.safety },
        status: "SUCCESS",
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === "fashion-creative") {
      const fashionBrand = ["bharatdrip", "bharatshop studio"].includes(String(product.brand || "").toLowerCase());
      const productionSupplier = clean(specs.productionSupplier, 80).toLowerCase();
      const inventoryMode = clean(specs.inventoryMode, 80).toUpperCase();
      const ipPolicy = clean(specs.ipPolicy, 200).toUpperCase();

      if (!fashionBrand || String(product.supplierName || "").toLowerCase() !== "qikink" || productionSupplier !== "qikink" || inventoryMode !== "MADE_TO_ORDER") {
        return NextResponse.json({ error: "Fashion creative workflow is limited to verified Qikink made-to-order fashion products" }, { status: 422 });
      }
      if (ipPolicy && !ipPolicy.includes("ORIGINAL")) {
        return NextResponse.json({ error: "Fashion creative workflow requires the original-art IP policy" }, { status: 422 });
      }
      if (Number(product.netProfitInr) <= 0 || Number(product.customMarginPct) < 18) {
        return NextResponse.json({ error: "Fashion creative workflow blocked by profitability gate" }, { status: 422 });
      }

      const result = await dispatchAutom8AiJob({
        workflow: "fashion-creative",
        source: "fashion-designer",
        product: {
          id: product.id,
          title: product.title,
          brand: product.brand,
          category: product.category,
          imageUrl: product.imageUrl,
          sellingPriceInr: Number(product.sellingPriceInr),
          marketingCopy: product.aiMarketingCopy,
          targetAudience: product.aiTargetAudience,
        },
        creative: {
          objective: clean(body.objective, 1200) || "Create an original fashion campaign concept plus UGC-style short-video brief for this product.",
          imageUrls,
          garment: clean(specs.qikinkProductName, 200),
          printMethod: clean(specs.printMethod, 120),
          artworkPrompt: clean(specs.artworkPrompt || specs.designBrief, 1800),
          trendName: clean(specs.trendName, 200),
          palette: Array.isArray(specs.palette) ? specs.palette.slice(0, 8) : [],
          preferredRenderer: "Higgsfield-or-configured-video-worker",
          ipPolicy: "ORIGINAL_ART_ONLY_NO_UNLICENSED_IP",
          publicationPolicy: "Return assets for review; never auto-publish the product or campaign.",
        },
      });
      await db.insert(aiActivityLogs).values({
        userId: product.userId,
        agentName: "AI Fashion Designer",
        actionType: "AUTOM8AI_FASHION_CREATIVE_QUEUED",
        message: `Autom8AI review-only fashion creative job queued for ${product.title}.`,
        metadataJson: { productId: product.id, remoteJobId: result.remoteJobId, remoteStatus: result.remoteStatus, safety: result.safety },
        status: "SUCCESS",
      });
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: "Unknown Autom8AI action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Autom8AI orchestration failed" }, { status: 500 });
  }
}
