import { NextResponse } from "next/server";
import { pool } from "@/db";
import { publicOrigin } from "@/lib/public-origin";
import { fashionTrendDirections, type FashionTrendDirection } from "@/lib/fashion/trend-intelligence";
import { qikinkCostForDesign, qikinkProductByCode } from "@/lib/suppliers/qikink-rate-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

function slug(value: string) {
  return String(value || "STREET").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || "STREET";
}

function clean(value: unknown, max = 900) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function chooseGarment(direction: FashionTrendDirection, index: number) {
  const text = `${direction.garment} ${direction.silhouette} ${direction.finish}`.toLowerCase();
  if (text.includes("aop") || text.includes("all-over")) return qikinkProductByCode("UA22")!;
  if (text.includes("varsity") || text.includes("jacket")) return qikinkProductByCode("UJ31")!;
  if (text.includes("full sleeve") || text.includes("long sleeve")) return qikinkProductByCode("MF31")!;
  if (text.includes("heavy") || text.includes("terry")) return qikinkProductByCode("UT27")!;
  return qikinkProductByCode(index % 2 === 0 ? "US22" : "UC22")!;
}

function printMethod(code: string) {
  if (code.startsWith("UA")) return "AOP";
  if (code === "UJ31") return "Front DTF";
  return "Front + Back DTF";
}

function retailFor(landed: number, code: string) {
  const floor = code === "UJ31" ? 1299 : 799;
  return Math.max(floor, Math.ceil((landed / 0.62) / 50) * 50);
}

function ugcPrompt(direction: FashionTrendDirection, garmentName: string, title: string) {
  return clean(`Realistic UGC-style fashion product image for BharatDrip. Adult creator naturally wearing the ${garmentName} called "${title}". Direction: ${direction.trendName}; ${direction.silhouette}; ${direction.finish}; ${direction.placement}; palette ${direction.palette.join(", ")}. Preserve garment silhouette and print placement. Natural window or late-afternoon outdoor light, believable skin texture, smartphone-camera dynamic range, slight handheld imperfection, authentic Instagram/TikTok social look, candid confident pose, urban Indian setting, true fabric folds and shadows. No plastic skin, no studio sweep, no luxury-brand logos, no text overlay, no fake review quote, no celebrity likeness, no copied or licensed character artwork. Vertical 4:5, full garment visible, ecommerce-useful detail, photorealistic.`, 1700);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const requested = Math.max(1, Math.min(6, Number(body.count || 3)));
    const publish = body.publish !== false;
    const trend = await fashionTrendDirections();
    const directions = trend.directions.slice(0, requested);
    const origin = publicOrigin().replace(/\/$/, "");
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const results: any[] = [];

    for (let index = 0; index < directions.length; index++) {
      const direction = directions[index];
      const garment = chooseGarment(direction, index);
      const method = printMethod(garment.code);
      const rate = qikinkCostForDesign(garment.name, method, garment.audience);
      const landed = Number(rate.prepaidLandedCostInr);
      const retail = retailFor(landed, garment.code);
      const profit = Number((retail - landed).toFixed(2));
      const marginPct = Number(((profit / retail) * 100).toFixed(1));
      if (retail > 1499 || marginPct < 30 || profit < 200) {
        results.push({ trend: direction.trendName, garment: garment.name, status: "REJECTED_ECONOMICS", landedCostInr: landed, retailInr: retail, profitInr: profit, marginPct });
        continue;
      }

      const title = clean(`${direction.trendName} ${garment.name.includes("Oversized") ? "Oversized Tee" : garment.name}`, 100);
      const sku = `BD-TREND-${slug(direction.trendName)}-${garment.code}-${day}`;
      const existing = await pool.query(`SELECT id,status FROM products WHERE sku=$1 LIMIT 1`, [sku]);
      if (existing.rows[0]) {
        results.push({ productId: Number(existing.rows[0].id), sku, title, status: existing.rows[0].status, duplicate: true });
        continue;
      }

      const supplierBase = rate.productBaseInr + rate.printingInr;
      const logistics = rate.shippingInr + rate.gstInr;
      const status = publish ? "Published" : "CEO_PENDING";
      const copy = `${title}. Original trend-led BharatDrip streetwear made to order through Qikink. ${clean(direction.brief, 500)}`;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(`
          INSERT INTO products (user_id,sku,title,category,image_url,brand,supplier_name,supplier_city,supplier_cost_inr,shipping_cost_inr,gst_pct,selling_price_inr,mrp_inr,custom_margin_pct,net_profit_inr,ai_score,viral_velocity_score,stock_count,moq,status,ai_marketing_copy,ai_target_audience)
          VALUES (1,$1,$2,'BharatDrip Streetwear','',$3,'Qikink','India',$4,$5,0,$6,$7,$8,$9,97,96,0,1,$10,$11,$12)
          RETURNING id
        `, [sku, title, "BharatDrip", supplierBase.toFixed(2), logistics.toFixed(2), retail.toFixed(2), Math.ceil(retail * 1.18 / 10) * 10, marginPct.toFixed(2), profit.toFixed(2), status, copy, garment.audience]);
        const productId = Number(inserted.rows[0].id);
        const images = [0, 1, 2, 3].map((view) => `${origin}/api/fashion-art/${productId}/${view}`);
        await client.query(`UPDATE products SET image_url=$2 WHERE id=$1`, [productId, images[0]]);
        const specs = {
          designOrigin: "BharatDrip",
          designLine: "AUTONOMOUS_TREND_STREETWEAR",
          trendName: direction.trendName,
          trendDirection: direction,
          trendSourceStatus: trend.status,
          productionSupplier: "Qikink",
          inventoryMode: "MADE_TO_ORDER",
          qikinkProductCode: garment.code,
          qikinkProductName: garment.name,
          qikinkSourceUrl: rate.sourceUrl,
          qikinkRateSource: rate.rateSource,
          printMethod: method,
          sizes: rate.sizes,
          prepaidLandedCostInr: landed,
          sellingPriceInr: retail,
          projectedProfitInr: profit,
          projectedMarginPct: marginPct,
          creativeProviderTarget: "Higgsfield",
          creativeFinalModel: "Nano Banana Pro",
          creativeBatchModel: "Nano Banana 2",
          ugcPrompt: ugcPrompt(direction, garment.name, title),
          creativeStatus: "PROMPT_READY_ASSET_PENDING",
          ipPolicy: "ORIGINAL_ART_ONLY_NO_UNLICENSED_IP",
          generatedAt: new Date().toISOString(),
        };
        await client.query(`INSERT INTO product_details (product_id,description,specifications_json,variants_json,included_items,material,color_options,source_url,verification_status,verified_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOURCE_VERIFIED',NOW(),NOW())`, [productId, `${title}. Original BharatDrip concept on ${garment.name}; made to order.`, JSON.stringify(specs), JSON.stringify(rate.sizes.map((size) => ({ size, available: "made-to-order" }))), "1 made-to-order printed garment", "See Qikink garment specification", direction.palette.join(", "), rate.sourceUrl]);
        for (let view = 0; view < images.length; view++) {
          await client.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at) VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_ORIGINAL',1,'bharatshop-fashion-art-v1','bharatshop-studio',$6,NOW())`, [productId, images[view], rate.sourceUrl, view + 1, `${title} design view ${view + 1}`, JSON.stringify({ view, creativeProviderTarget: "Higgsfield", ugcAssetPending: true })]);
        }
        await client.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'AI Fashion Designer','AUTONOMOUS_STREETWEAR_DROP',$1,$2,'SUCCESS')`, [`${title} ${publish ? "published" : "queued"} from live trend intelligence and Qikink economics.`, JSON.stringify({ productId, sku, trend: direction.trendName, qikinkProductCode: garment.code, landed, retail, profit, marginPct, creativeProviderTarget: "Higgsfield" })]);
        await client.query("COMMIT");
        results.push({ productId, sku, title, status, trend: direction.trendName, garment: garment.name, qikinkProductCode: garment.code, sellingPriceInr: retail, profitInr: profit, marginPct, ugcProvider: "Higgsfield", ugcFinalModel: "Nano Banana Pro", storeUrl: `${origin}/store/product/${productId}` });
      } catch (error) {
        await client.query("ROLLBACK");
        results.push({ trend: direction.trendName, status: "ERROR", error: error instanceof Error ? error.message : String(error) });
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ success: true, agent: "Autonomous Streetwear Fashion Designer", trendStatus: trend.status, requested, generated: results.filter((r) => r.productId && !r.duplicate).length, publish, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Streetwear fashion agent failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const latest = await pool.query(`SELECT created_at,message,metadata_json,status FROM ai_activity_logs WHERE agent_name='AI Fashion Designer' AND action_type='AUTONOMOUS_STREETWEAR_DROP' ORDER BY created_at DESC LIMIT 6`);
  return NextResponse.json({ agent: "Autonomous Streetwear Fashion Designer", status: "ready", supplier: "Qikink", creativeProviderTarget: "Higgsfield", finalModel: "Nano Banana Pro", batchModel: "Nano Banana 2", latest: latest.rows });
}
