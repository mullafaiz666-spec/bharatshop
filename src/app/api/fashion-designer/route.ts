import { NextResponse } from "next/server";
import { pool } from "@/db";
import { geminiImage, geminiText, logGoogleMedia } from "@/lib/ai/google-media";
import { qikinkCostForDesign } from "@/lib/suppliers/qikink-rate-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") === expected;
}

const DESIGN_SCHEMA = {
  type: "object",
  properties: {
    marketSummary: { type: "string" },
    designs: { type: "array", items: { type: "object", properties: {
      title: { type: "string" }, category: { type: "string" }, garment: { type: "string" }, designBrief: { type: "string" }, targetAudience: { type: "string" }, trendReason: { type: "string" }, priceTargetInr: { type: "number" }, aiScore: { type: "integer" }, viralVelocityScore: { type: "integer" }, colorPalette: { type: "string" }, printMethod: { type: "string" }, imagePrompt: { type: "string" }, ugcHook: { type: "string" }
    }, required: ["title","category","garment","designBrief","targetAudience","trendReason","priceTargetInr","aiScore","viralVelocityScore","colorPalette","printMethod","imagePrompt","ugcHook"] } }
  },
  required: ["marketSummary","designs"]
};

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function run(count: number) {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) throw new Error("GEMINI_API_KEY is required");
  const safeCount = Math.max(10, Math.min(25, count));
  const existing = await pool.query(`SELECT title,category,sales_count_24h,ai_score FROM products ORDER BY sales_count_24h DESC, ai_score DESC LIMIT 40`);
  const existingText = existing.rows.map((r: any) => `${r.title} | ${r.category} | 24h sales ${r.sales_count_24h} | score ${r.ai_score}`).join("\n");
  const prompt = `You are BharatShop's autonomous Indian fashion designer and commercial trend strategist. Research today's Indian fashion demand using Google Search grounding before deciding what to design. Create exactly ${safeCount} ORIGINAL, commercially printable product concepts for a print-on-demand brand. Prioritize designs that can be produced by Qikink, strong Indian market relevance, clear differentiation, healthy margin potential and fast social-media appeal. Do not copy logos, copyrighted characters, protected artwork or existing brand identities. Avoid claims that a trend is certain. Use current evidence to explain why each concept is worth testing. Existing catalogue (avoid duplicates):\n${existingText || "none"}\nReturn ONLY valid JSON matching this schema: ${JSON.stringify(DESIGN_SCHEMA)}`;
  const plan = parseJson(await geminiText(prompt));
  if (!Array.isArray(plan.designs)) throw new Error("Designer returned no designs");

  const results: any[] = [];
  for (const design of plan.designs.slice(0, safeCount)) {
    try {
      const image = await geminiImage(`Create the production-ready hero visual for this original fashion product concept. Show the exact garment design clearly and realistically, suitable for a premium ecommerce catalog. No fake brand logos, no copyrighted characters, no watermarks added by the prompt. Design brief: ${design.designBrief}. Garment: ${design.garment}. Colors: ${design.colorPalette}. Print method: ${design.printMethod}.`, { aspectRatio: "4:5", imageSize: process.env.GEMINI_IMAGE_SIZE || "1K" });
      const sku = `AI-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
      const rate = qikinkCostForDesign(String(design.garment || "Unisex Classic Crew T-Shirt"), String(design.printMethod || "DTF"));
      const cost = rate.landedCostInr;
      const target = Math.max(Number(design.priceTargetInr || 999), Math.ceil(cost / 0.55));
      const profit = Math.max(0, target - cost);
      const margin = target ? (profit / target) * 100 : 0;
      const status = margin >= Number(process.env.MIN_AI_PRODUCT_MARGIN_PCT || 35) ? "AI_DRAFT" : "REJECTED_MARGIN";

      const inserted = await pool.query(`INSERT INTO products (user_id,sku,title,category,image_url,brand,supplier_name,supplier_city,supplier_cost_inr,shipping_cost_inr,gst_pct,selling_price_inr,mrp_inr,custom_margin_pct,net_profit_inr,ai_score,viral_velocity_score,status,ai_marketing_copy,ai_target_audience,stock_count,moq) VALUES (1,$1,$2,$3,$4,'BharatShop AI','Qikink','India',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,1) RETURNING id`, [sku, design.title, design.category, image, rate.landedCostInr, rate.shippingInr, rate.gstInr > 0 ? 5 : 5, target, Math.ceil(target * 1.2), margin, profit, Math.round(design.aiScore || 70), Math.round(design.viralVelocityScore || 70), status, `${design.trendReason}\nUGC hook: ${design.ugcHook}`, design.targetAudience]);
      const productId = inserted.rows[0]?.id;
      await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) VALUES ($1,$2,'GOOGLE_GEMINI_AI',0,$3,'AI_GENERATED')`, [productId, image, design.title]);
      await logGoogleMedia(productId, "FASHION_DESIGN", { title: design.title, aiScore: design.aiScore, status, marketSummary: plan.marketSummary, qikinkRate: rate });
      results.push({ productId, sku, title: design.title, status, margin: Math.round(margin), qikink: { status: "RATE_CARD_MAPPED", ...rate } });
    } catch (error) {
      results.push({ title: design.title, status: "FAILED", error: error instanceof Error ? error.message : "unknown error" });
    }
  }
  return { success: true, provider: "google-gemini", requested: safeCount, generated: results.filter((x) => x.status !== "FAILED").length, marketSummary: plan.marketSummary, qikink: { mode: "PUBLIC_RATE_CARD", credentialsRequired: false }, results };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ status: "READY", agent: "AI Fashion Designer", dailyTarget: "10-25", imageProvider: "Google Gemini / Nano Banana 2", ugcVideoProvider: "Google Veo", supplier: "Qikink", qikinkPricing: "PUBLIC_RATE_CARD", credentialsRequiredForPricing: false, autoPublish: false });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await run(Number(body.count || 10)));
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Fashion Designer failed" }, { status: 500 });
  }
}
