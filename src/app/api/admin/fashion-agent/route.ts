import { NextResponse } from "next/server";
import { pool } from "@/db";
import { getAdminUser } from "@/lib/admin-auth";
import { publicOrigin } from "@/lib/public-origin";
import { fashionTrendDirections, type FashionTrendDirection } from "@/lib/fashion/trend-intelligence";
import { QIKINK_PRODUCTS, qikinkCostForDesign, qikinkProductByCode } from "@/lib/suppliers/qikink-rate-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const STREETWEAR_CODES = new Set(["US22", "UC22", "UT27", "UA22", "UJ31", "FC32", "MF31"]);
const IP_RISK = /\b(nike|adidas|puma|gucci|louis vuitton|supreme|stussy|bape|aape|one piece|naruto|dragon ball|pokemon|marvel|dc comics|batman|spider[- ]?man|demon slayer|jujutsu kaisen|attack on titan|goku|luffy)\b/i;

function clean(value: unknown, max = 500) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function garmentLabel(name: string) {
  const n = name.toLowerCase();
  if (n.includes("varsity")) return "Varsity Jacket";
  if (n.includes("hood")) return "Hoodie";
  if (n.includes("crop")) return "Crop Hoodie";
  if (n.includes("full sleeve")) return "Long-Sleeve Tee";
  if (n.includes("aop")) return "AOP Oversized Tee";
  if (n.includes("terry")) return "Heavy Oversized Tee";
  return "Oversized Tee";
}

function printMethodFor(code: string) {
  if (code.startsWith("UA") || code.startsWith("FA") || code.startsWith("KA")) return "AOP";
  if (code === "UJ31" || code === "FC32") return "Front DTF";
  return "Front + Back DTF";
}

function priceFor(landed: number, code: string) {
  const floor = code === "UJ31" ? 1299 : code === "FC32" ? 999 : 799;
  const marginPrice = Math.ceil((landed / 0.62) / 50) * 50;
  return Math.max(floor, marginPrice);
}

function matchedGarment(direction: FashionTrendDirection) {
  const g = `${direction.garment} ${direction.silhouette}`.toLowerCase();
  if (g.includes("varsity") || g.includes("jacket")) return qikinkProductByCode("UJ31")!;
  if (g.includes("hood")) return qikinkProductByCode("FC32") || qikinkProductByCode("UT27")!;
  if (g.includes("aop") || g.includes("all-over")) return qikinkProductByCode("UA22")!;
  if (g.includes("full sleeve") || g.includes("long sleeve")) return qikinkProductByCode("MF31")!;
  if (g.includes("heavy") || g.includes("terry")) return qikinkProductByCode("UT27")!;
  return qikinkProductByCode("US22")!;
}

function buildPlan(direction: FashionTrendDirection, garmentCode?: string) {
  const garment = qikinkProductByCode(clean(garmentCode, 12)) || matchedGarment(direction);
  const printMethod = printMethodFor(garment.code);
  const rate = qikinkCostForDesign(garment.name, printMethod, garment.audience);
  const landed = Number(rate.prepaidLandedCostInr);
  const selling = priceFor(landed, garment.code);
  const profit = Number((selling - landed).toFixed(2));
  const marginPct = Number(((profit / selling) * 100).toFixed(1));
  const title = clean(`${direction.trendName} ${garmentLabel(garment.name)}`, 100);
  const brief = clean(`${direction.brief} Silhouette: ${direction.silhouette}. Finish: ${direction.finish}. Placement: ${direction.placement}. Palette: ${direction.palette.join(", ")}.`, 850);
  const artworkPrompt = clean(
    `Create ORIGINAL print-ready streetwear artwork for BharatDrip. Product: ${garment.name}. Direction: ${direction.trendName}. ${brief} No logos, no existing brands, no franchise characters, no celebrity likenesses, no copied marketplace art. Strong silhouette at thumbnail size, intentional negative space, premium screen-print/DTF readability, transparent-background master artwork where possible.`,
    1400,
  );
  const ugcPrompt = clean(
    `Realistic UGC-style fashion product photo for BharatDrip showing an adult creator naturally wearing the ${garment.name} called \"${title}\". Preserve the garment silhouette and print placement exactly. Streetwear styling: ${direction.silhouette}; ${direction.finish}; ${direction.palette.join(", ")} palette. Natural window or late-afternoon outdoor light, believable skin texture, subtle phone-camera dynamic range, slight handheld imperfection, authentic Instagram/TikTok social post look, candid confident pose, urban Indian setting that feels real rather than staged, true fabric folds, accurate shadows, no plastic skin, no studio sweep, no luxury-brand logos, no text overlays, no fake review quote, no copyrighted character art. Vertical 4:5 product-first composition, full garment visible, ecommerce-useful detail, photorealistic.`,
    1700,
  );
  return {
    title,
    brand: "BharatDrip",
    category: "BharatDrip Streetwear",
    trend: direction,
    garment: { code: garment.code, name: garment.name, audience: garment.audience, sizes: garment.sizes, baseInr: garment.baseInr },
    printMethod,
    economics: { landedCostInr: landed, sellingPriceInr: selling, profitInr: profit, marginPct },
    artworkPrompt,
    ugc: {
      provider: "Higgsfield",
      finalModel: "Nano Banana Pro",
      batchModel: "Nano Banana 2",
      aspectRatio: "4:5",
      prompt: ugcPrompt,
      disclosure: "AI-generated model imagery should not be presented as a real customer testimonial.",
    },
    source: { supplier: "Qikink", sourceUrl: rate.sourceUrl, rateSource: rate.rateSource },
  };
}

async function latestProducts(userId: number) {
  const rows = await pool.query(`
    SELECT p.id,p.sku,p.title,p.category,p.brand,p.status,p.image_url,p.selling_price_inr,p.net_profit_inr,p.custom_margin_pct,p.updated_at,
           d.specifications_json
    FROM products p
    LEFT JOIN product_details d ON d.product_id=p.id
    WHERE p.user_id=$1 AND LOWER(COALESCE(d.specifications_json->>'designOrigin',p.brand,'')) IN ('bharatdrip','bharatshop studio')
    ORDER BY p.updated_at DESC,p.id DESC
    LIMIT 18
  `, [userId]);
  return rows.rows.map((r: any) => ({
    id: Number(r.id), sku: r.sku, title: r.title, category: r.category, brand: r.brand, status: r.status,
    imageUrl: r.image_url || "", sellingPriceInr: Number(r.selling_price_inr || 0), netProfitInr: Number(r.net_profit_inr || 0),
    marginPct: Number(r.custom_margin_pct || 0), updatedAt: r.updated_at, specifications: r.specifications_json || {},
  }));
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trends = await fashionTrendDirections();
  const directions = trends.directions.slice(0, 8);
  const plans = directions.slice(0, 4).map((direction) => buildPlan(direction));
  return NextResponse.json({
    status: "READY",
    agent: "BharatDrip Fashion Designer AI",
    operator: { id: admin.id, name: admin.name, role: admin.role },
    trends: { status: trends.status, summary: trends.summary, directions, signals: trends.signals.slice(0, 8), errors: trends.errors },
    qikink: QIKINK_PRODUCTS.filter((p) => STREETWEAR_CODES.has(p.code)).map((p) => ({ code: p.code, name: p.name, audience: p.audience, sizes: p.sizes, baseInr: p.baseInr, sourceUrl: p.sourceUrl })),
    recommendedDrops: plans,
    products: await latestProducts(admin.id),
    creative: {
      provider: "Higgsfield",
      finalModel: "Nano Banana Pro",
      batchModel: "Nano Banana 2",
      mode: "prompt-packet-ready",
      note: "The ChatGPT Higgsfield plugin can generate these assets interactively. BharatShop keeps provider prompts and accepts the resulting image URL without assuming undocumented Higgsfield API fields.",
    },
    pipeline: ["Trend scan", "Qikink garment pick", "Original design plan", "Higgsfield media", "Economics/IP gate", "CEO approval", "Store listing"],
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = clean(body.action, 32) || "plan";

  if (action === "attach-ugc") {
    const productId = Number(body.productId);
    const imageUrl = clean(body.imageUrl, 1600);
    if (!Number.isInteger(productId) || productId <= 0 || !/^https:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: "Valid productId and HTTPS imageUrl are required" }, { status: 400 });
    }
    const found = await pool.query(`SELECT id,title FROM products WHERE id=$1 AND user_id=$2 AND brand='BharatDrip' LIMIT 1`, [productId, admin.id]);
    if (!found.rows[0]) return NextResponse.json({ error: "BharatDrip product not found" }, { status: 404 });

    await pool.query(`UPDATE products SET image_url=$2,updated_at=NOW() WHERE id=$1`, [productId, imageUrl]);
    const primary = await pool.query(`SELECT id FROM product_images WHERE product_id=$1 ORDER BY sort_order ASC,id ASC LIMIT 1`, [productId]);
    const metadata = JSON.stringify({ provider: "Higgsfield", intendedModel: "Nano Banana Pro", usage: "UGC hero image", attachedBy: admin.id, disclosure: "AI-generated model/editorial image" });
    if (primary.rows[0]) {
      await pool.query(`UPDATE product_images SET image_url=$2,source_url=$2,sort_order=0,alt_text=$3,verification_status='AI_GENERATED_EDITORIAL',verification_confidence=1,verification_model='nano-banana-pro',verification_provider='higgsfield',verification_metadata=$4,verified_at=NOW() WHERE id=$1`, [primary.rows[0].id, imageUrl, `${found.rows[0].title} UGC hero`, metadata]);
    } else {
      await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at) VALUES ($1,$2,$2,0,$3,'AI_GENERATED_EDITORIAL',1,'nano-banana-pro','higgsfield',$4,NOW())`, [productId, imageUrl, `${found.rows[0].title} UGC hero`, metadata]);
    }
    await pool.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES ($1,'AI Fashion Designer','HIGGSFIELD_UGC_ATTACHED',$2,$3,'SUCCESS')`, [admin.id, `Higgsfield UGC hero attached to ${found.rows[0].title}.`, JSON.stringify({ productId, imageUrl })]);
    return NextResponse.json({ success: true, status: "UGC_ATTACHED", productId, imageUrl });
  }

  const trends = await fashionTrendDirections();
  const requestedTrend = clean(body.trendName, 120).toLowerCase();
  const direction = trends.directions.find((d) => d.trendName.toLowerCase() === requestedTrend) || trends.directions[Number(body.trendIndex) || 0] || trends.directions[0];
  if (!direction) return NextResponse.json({ error: "No fashion trend direction available" }, { status: 503 });
  const plan = buildPlan(direction, body.garmentCode);
  if (IP_RISK.test(`${plan.title} ${plan.trend.brief}`)) return NextResponse.json({ error: "Trend plan failed IP safety checks" }, { status: 422 });

  if (action === "plan") return NextResponse.json({ success: true, status: "PLAN_READY", plan });
  if (action !== "queue-and-list") return NextResponse.json({ error: "Unknown fashion-agent action" }, { status: 400 });

  const publishNow = body.publishNow === true;
  const { garment, economics } = plan;
  if (economics.marginPct < 30 || economics.profitInr < 200) {
    return NextResponse.json({ error: "Drop blocked by profitability gate", plan }, { status: 422 });
  }
  if (economics.sellingPriceInr > 1499) {
    return NextResponse.json({ error: "Drop blocked because the current Qikink production cost pushes retail above the ₹1,499 streetwear ceiling", plan }, { status: 422 });
  }

  const rate = qikinkCostForDesign(garment.name, plan.printMethod, garment.audience);
  const now = new Date();
  const suffix = `${now.toISOString().slice(0, 10).replaceAll("-", "")}-${now.getTime().toString(36).toUpperCase().slice(-6)}`;
  const sku = `BD-AI-${garment.code}-${suffix}`;
  const status = publishNow ? "Published" : "CEO_PENDING";
  const supplierBase = rate.productBaseInr + rate.printingInr;
  const logistics = rate.shippingInr + rate.gstInr;
  const copy = `${plan.title}. Trend-led original BharatDrip streetwear, made to order through Qikink. ${clean(plan.trend.brief, 500)}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`
      INSERT INTO products (user_id,sku,title,category,image_url,brand,supplier_name,supplier_city,supplier_cost_inr,shipping_cost_inr,gst_pct,selling_price_inr,mrp_inr,custom_margin_pct,net_profit_inr,ai_score,viral_velocity_score,stock_count,moq,status,ai_marketing_copy,ai_target_audience)
      VALUES ($1,$2,$3,'BharatDrip Streetwear','',$4,'Qikink','India',$5,$6,0,$7,$8,$9,$10,97,96,0,1,$11,$12,$13)
      RETURNING id
    `, [admin.id, sku, plan.title, "BharatDrip", supplierBase.toFixed(2), logistics.toFixed(2), economics.sellingPriceInr.toFixed(2), Math.ceil(economics.sellingPriceInr * 1.18 / 10) * 10, economics.marginPct.toFixed(2), economics.profitInr.toFixed(2), status, copy, garment.audience]);
    const productId = Number(inserted.rows[0].id);
    const origin = publicOrigin().replace(/\/$/, "");
    const fallbackImages = [0, 1, 2, 3].map((view) => `${origin}/api/fashion-art/${productId}/${view}`);
    await client.query(`UPDATE products SET image_url=$2 WHERE id=$1`, [productId, fallbackImages[0]]);
    const specs = {
      designOrigin: "BharatDrip",
      designLine: "AI_STREETWEAR",
      fashionAgentVersion: "streetwear-agent-v1",
      trendName: plan.trend.trendName,
      trendDirection: plan.trend,
      productionSupplier: "Qikink",
      inventoryMode: "MADE_TO_ORDER",
      qikinkProductCode: rate.productCode,
      qikinkProductName: rate.productName,
      qikinkSourceUrl: rate.sourceUrl,
      qikinkRateSource: rate.rateSource,
      printMethod: plan.printMethod,
      sizes: rate.sizes,
      prepaidLandedCostInr: economics.landedCostInr,
      sellingPriceInr: economics.sellingPriceInr,
      projectedProfitInr: economics.profitInr,
      projectedMarginPct: economics.marginPct,
      artworkPrompt: plan.artworkPrompt,
      ugcCreative: plan.ugc,
      creativeProviderTarget: "Higgsfield",
      creativeFinalModel: "Nano Banana Pro",
      creativeBatchModel: "Nano Banana 2",
      creativeStatus: "PROMPT_READY_ASSET_PENDING",
      ipPolicy: "ORIGINAL_ART_ONLY_NO_UNLICENSED_IP",
      generatedAt: now.toISOString(),
      generatedBy: { id: admin.id, role: admin.role },
    };
    await client.query(`INSERT INTO product_details (product_id,description,specifications_json,variants_json,included_items,material,color_options,source_url,verification_status,verified_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOURCE_VERIFIED',NOW(),NOW())`, [productId, `${plan.title}. Original trend-led BharatDrip artwork on ${rate.productName}; made to order.`, JSON.stringify(specs), JSON.stringify(rate.sizes.map((size) => ({ size, available: "made-to-order" }))), "1 made-to-order printed garment", "See Qikink garment specification", plan.trend.palette.join(", "), rate.sourceUrl]);
    for (let view = 0; view < fallbackImages.length; view++) {
      await client.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at) VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_ORIGINAL',1,'bharatshop-fashion-art-v1','bharatshop-studio',$6,NOW())`, [productId, fallbackImages[view], rate.sourceUrl, view + 1, `${plan.title} design view ${view + 1}`, JSON.stringify({ providerTarget: "Higgsfield", ugcAssetPending: true, view })]);
    }
    await client.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES ($1,'AI Fashion Designer',$2,$3,$4,'SUCCESS')`, [admin.id, publishNow ? "TREND_DROP_PUBLISHED" : "TREND_DROP_QUEUED", `${plan.title} ${publishNow ? "published" : "queued"} from trend intelligence and Qikink production economics.`, JSON.stringify({ productId, sku, trend: plan.trend.trendName, qikinkProductCode: garment.code, economics, creativeProviderTarget: "Higgsfield", ugcStatus: "PROMPT_READY_ASSET_PENDING" })]);
    await client.query("COMMIT");
    return NextResponse.json({ success: true, status: publishNow ? "PUBLISHED" : "CEO_PENDING", productId, sku, plan, fallbackImages, storeUrl: `${origin}/store/product/${productId}` });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fashion agent failed to queue the drop" }, { status: 500 });
  } finally {
    client.release();
  }
}
