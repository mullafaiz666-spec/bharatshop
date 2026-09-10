import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { pool } from "@/db";
import { publicOrigin } from "@/lib/public-origin";
import { openAIJson } from "@/lib/ai/agent-tools";
import { catalogEconomicsPolicy } from "@/lib/catalog/economics-policy";
import { QIKINK_PRODUCTS, qikinkCostForDesign, qikinkProductByCode } from "@/lib/suppliers/qikink-rate-card";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BRANDS = new Set(["BharatShop Studio", "BharatDrip"]);
const PRINT_METHODS = ["Pocket DTF", "Front DTF", "Front + Back DTF", "AOP", "Embroidery"] as const;
const IP_RISK = /\b(nike|adidas|puma|gucci|lv|louis vuitton|supreme|one piece|naruto|dragon ball|pokemon|marvel|dc comics|batman|spider[- ]?man|demon slayer|jujutsu kaisen|attack on titan|goku|luffy)\b/i;

function clean(value: unknown, max = 280) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}
function validHex(value: unknown) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); }
function paletteOf(value: unknown) {
  const raw = Array.isArray(value) ? value : [];
  const out = raw.map(String).filter(validHex).slice(0, 3);
  while (out.length < 3) out.push(["#111827", "#f97316", "#f8fafc"][out.length]);
  return out;
}
function placementOf(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const clamp = (raw: unknown, min: number, max: number, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  return {
    side: row.side === "back" ? "back" : "front",
    x: clamp(row.x, -70, 70, 0),
    y: clamp(row.y, -90, 90, 0),
    scale: clamp(row.scale, 45, 145, 100),
    rotate: clamp(row.rotate, -25, 25, 0),
  };
}
function audienceCategory(audience: string, brand: string) {
  if (brand === "BharatDrip") return "BharatDrip Streetwear";
  if (audience === "women") return "Women's Fashion";
  if (audience === "kids") return "Baby & Kids";
  return "Men's Fashion";
}
function priceBand(brand: string) {
  return brand === "BharatDrip" ? { min: 599, max: 999, line: "DESIGNER" } : { min: 129, max: 599, line: "VALUE" };
}
function designCode(title: string) {
  const slug = title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 22) || "CUSTOM";
  return `CUSTOM-${slug}`;
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await pool.query(`
    SELECT p.id,p.sku,p.title,p.category,p.brand,p.status,p.selling_price_inr,p.net_profit_inr,p.custom_margin_pct,p.updated_at,
           d.specifications_json
    FROM products p
    LEFT JOIN product_details d ON d.product_id=p.id
    WHERE p.user_id=$1 AND LOWER(COALESCE(d.specifications_json->>'designOrigin',p.brand,'')) IN ('bharatshop studio','bharatdrip')
    ORDER BY p.updated_at DESC,p.id DESC
    LIMIT 30
  `, [admin.id]);
  const audit = await pool.query(`SELECT id,action_type,message,status,created_at,metadata_json FROM ai_activity_logs WHERE user_id=$1 AND agent_name IN ('AI Fashion Designer','Fashion Designer Studio') ORDER BY id DESC LIMIT 20`, [admin.id]);
  return NextResponse.json({
    status: "READY",
    audit: audit.rows,
    operator: { id: admin.id, name: admin.name, role: admin.role },
    brands: Array.from(BRANDS),
    printMethods: PRINT_METHODS,
    garments: QIKINK_PRODUCTS.map(p => ({ code: p.code, name: p.name, audience: p.audience, sizes: p.sizes, baseInr: p.baseInr })),
    priceBands: { "BharatShop Studio": { min: 129, max: 599 }, BharatDrip: { min: 599, max: 999 } },
    products: rows.rows.map((r: any) => ({
      id: Number(r.id), sku: r.sku, title: r.title, category: r.category, brand: r.brand, status: r.status,
      sellingPriceInr: Number(r.selling_price_inr), netProfitInr: Number(r.net_profit_inr), marginPct: Number(r.custom_margin_pct),
      updatedAt: r.updated_at, specifications: r.specifications_json || {},
    })),
    policy: "Original artwork only. Qikink production mapping and category economics are checked before a design can be queued. Final publication remains CEO/listing-gated.",
  });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = clean(body.action, 40) || "concept";
  const brand = BRANDS.has(String(body.brand)) ? String(body.brand) : "BharatDrip";
  const audience = ["unisex", "men", "women", "kids"].includes(String(body.audience)) ? String(body.audience) : "unisex";
  const garment = qikinkProductByCode(clean(body.garmentCode, 12)) || QIKINK_PRODUCTS.find(p => p.audience === audience) || QIKINK_PRODUCTS[0];
  const printMethod = PRINT_METHODS.includes(String(body.printMethod) as any) ? String(body.printMethod) : (brand === "BharatDrip" ? "Front + Back DTF" : "Pocket DTF");
  const palette = paletteOf(body.palette);
  const placement = placementOf(body.placement);
  const garmentColor = validHex(body.garmentColor) ? String(body.garmentColor) : palette[0];
  const mood = clean(body.mood || body.styleKeywords || "original modern Indian streetwear", 500);
  const collection = clean(body.collection || (brand === "BharatDrip" ? "BharatDrip Drop" : "BharatShop Studio Capsule"), 120);

  if (action === "concept") {
    let concept: any = null;
    let provider = "deterministic-fallback";
    try {
      concept = await openAIJson(
        "You are BharatShop's original fashion design director. Create one commercially wearable fashion concept using only original artwork. Never use third-party logos, brand marks, licensed characters, celebrity likenesses, or close copies of copyrighted anime/manga characters. Return JSON {title,designBrief,palette:[hex,hex,hex],frontPlacement,backPlacement,stylingNote,targetAudience}. Keep it concise and production-ready.",
        { brand, audience, garment: garment.name, printMethod, mood, collection, requestedPalette: palette },
        { timeoutMs: 12000, maxTokens: 500 },
      );
      provider = "local-Gemma";
    } catch {}
    const fallback = {
      title: brand === "BharatDrip" ? "Afterdark Signal Oversized Tee" : "Signal Line Essential Tee",
      designBrief: `${mood}. Original abstract symbol system with bold negative space, clean linework and no third-party IP.`,
      palette,
      frontPlacement: printMethod.includes("Back") ? "small chest crest" : "center/front placement",
      backPlacement: printMethod.includes("Back") ? "large original back composition" : "none",
      stylingNote: brand === "BharatDrip" ? "baggy denim or cargos, clean sneakers, urban streetwear styling" : "simple everyday styling",
      targetAudience: audience,
    };
    const safe = { ...fallback, ...(concept || {}) };
    safe.title = clean(safe.title, 100) || fallback.title;
    safe.designBrief = clean(safe.designBrief, 700) || fallback.designBrief;
    safe.palette = paletteOf(safe.palette);
    if (IP_RISK.test(`${safe.title} ${safe.designBrief}`)) {
      safe.title = fallback.title;
      safe.designBrief = fallback.designBrief;
      provider = `${provider}-ip-safety-fallback`;
    }
    const rate = qikinkCostForDesign(garment.name, printMethod, audience);
    return NextResponse.json({ status: "CONCEPT_READY", provider, concept: safe, production: rate, brand, audience, garment, printMethod, collection });
  }

  if (action !== "create") return NextResponse.json({ error: "Unknown fashion-studio action" }, { status: 400 });

  const title = clean(body.title, 100);
  const brief = clean(body.designBrief || body.brief, 700);
  if (!title || !brief) return NextResponse.json({ error: "title and designBrief are required" }, { status: 400 });
  if (IP_RISK.test(`${title} ${brief}`)) return NextResponse.json({ error: "Design appears to reference third-party brands or licensed characters. Use an original concept." }, { status: 422 });

  const band = priceBand(brand);
  const target = Math.round(Number(body.targetPriceInr || (brand === "BharatDrip" ? 799 : 399)));
  if (!Number.isFinite(target) || target < band.min || target > band.max) {
    return NextResponse.json({ error: `${brand} target price must stay within ₹${band.min}-₹${band.max}`, priceBand: band }, { status: 422 });
  }

  const rate = qikinkCostForDesign(garment.name, printMethod, audience);
  const category = audienceCategory(audience, brand);
  const economicsPolicy = catalogEconomicsPolicy(category, true);
  const landed = Number(rate.prepaidLandedCostInr);
  const profit = target - landed;
  const margin = target > 0 ? profit / target * 100 : 0;
  const minimumPrice = Math.ceil(Math.max(landed / (1 - economicsPolicy.minMarginPct / 100), landed + economicsPolicy.minProfitInr) / 10) * 10;
  if (profit < economicsPolicy.minProfitInr || margin < economicsPolicy.minMarginPct) {
    return NextResponse.json({
      error: "Target price does not meet the made-to-order profitability floor.",
      economics: { targetPriceInr: target, landedCostInr: landed, profitInr: Number(profit.toFixed(2)), marginPct: Number(margin.toFixed(2)), minimumPriceInr: minimumPrice, policy: economicsPolicy },
    }, { status: 422 });
  }

  const now = new Date();
  const suffix = `${now.toISOString().slice(0,10).replaceAll("-","")}-${now.getTime().toString(36).toUpperCase().slice(-6)}`;
  const sku = `${brand === "BharatDrip" ? "BD" : "BSF"}-CUSTOM-${suffix}`;
  const sourceUrl = rate.sourceUrl;
  const supplierBase = rate.productBaseInr + rate.printingInr;
  const logistics = rate.shippingInr + rate.gstInr;
  const mrp = Math.max(target, Math.ceil(target * 1.18 / 10) * 10);
  const copy = `${title}. Original ${brand} made-to-order design. ${brief}`;
  const code = designCode(title);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`
      INSERT INTO products (user_id,sku,title,category,image_url,brand,supplier_name,supplier_city,supplier_cost_inr,shipping_cost_inr,gst_pct,selling_price_inr,mrp_inr,custom_margin_pct,net_profit_inr,ai_score,viral_velocity_score,stock_count,moq,status,ai_marketing_copy,ai_target_audience)
      VALUES ($15,$1,$2,$3,'',$4,'Qikink','India',$5,$6,0,$7,$8,$9,$10,$11,$12,0,1,'CEO_PENDING',$13,$14)
      RETURNING id
    `, [sku,title,category,brand,supplierBase.toFixed(2),logistics.toFixed(2),target.toFixed(2),mrp.toFixed(2),margin.toFixed(2),profit.toFixed(2),brand === "BharatDrip" ? 96 : 90,brand === "BharatDrip" ? 95 : 84,copy,audience,admin.id]);
    const productId = Number(inserted.rows[0].id);
    const origin = publicOrigin();
    const images = [0,1,2,3].map(view => `${origin}/api/fashion-art/${productId}/${view}`);
    await client.query(`UPDATE products SET image_url=$2 WHERE id=$1`, [productId, images[0]]);

    const specs = {
      designOrigin: brand,
      designLine: band.line,
      productionSupplier: "Qikink",
      inventoryMode: "MADE_TO_ORDER",
      qikinkProductCode: rate.productCode,
      qikinkProductName: rate.productName,
      qikinkRateSource: rate.rateSource,
      qikinkSourceUrl: sourceUrl,
      printMethod,
      printPlacements: rate.printPlacements || 1,
      designBrief: brief,
      designCode: code,
      palette,
      garmentColor,
      artworkPlacement: placement,
      audience,
      sizes: rate.sizes,
      collection,
      mood,
      prepaidLandedCostInr: landed,
      codSurchargeInr: Number((rate.codInr + rate.codGstInr).toFixed(2)),
      marketPriceCeilingInr: target,
      pricingPolicy: brand === "BharatDrip" ? "BHARATDRIP_DESIGNER_MARKET_BAND" : "MARKET_BACKWARD_HARD_CEILING",
      minMarginPct: economicsPolicy.minMarginPct,
      minProfitInr: economicsPolicy.minProfitInr,
      ipPolicy: "ORIGINAL_ART_ONLY_NO_UNLICENSED_CHARACTERS",
      studioVersion: "fashion-studio-v2",
      studioCreatedBy: { id: admin.id, name: admin.name, role: admin.role },
      studioCreatedAt: now.toISOString(),
    };

    await client.query(`
      INSERT INTO product_details (product_id,description,specifications_json,variants_json,included_items,material,color_options,source_url,verification_status,verified_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOURCE_VERIFIED',NOW(),NOW())
    `, [productId, `${title}. Original ${brand} artwork on ${rate.productName}; made to order.`, JSON.stringify(specs), JSON.stringify(rate.sizes.map(size => ({ size, available: "made-to-order" }))), "1 made-to-order printed garment", "See Qikink garment specification", palette.join(", "), sourceUrl]);

    for (let view = 0; view < images.length; view++) {
      await client.query(`
        INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at)
        VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_ORIGINAL',1,'bharatshop-studio-custom-v2','bharatshop-studio',$6,NOW())
      `, [productId, images[view], sourceUrl, view, `${title} view ${view + 1}`, JSON.stringify({ designOrigin: brand, designLine: band.line, designCode: code, view, garmentColor, artworkPlacement: placement, ipPolicy: "original-only", studio: true, studioVersion: "fashion-studio-v2" })]);
    }

    await client.query(`
      INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
      VALUES ($3,'AI Fashion Designer','STUDIO_DESIGN_QUEUED',$1,$2,'SUCCESS')
    `, [`${title} was queued from Fashion Designer Studio after Qikink costing and economics checks.`, JSON.stringify({ productId, sku, brand, line: band.line, garmentCode: rate.productCode, printMethod, targetPriceInr: target, landedCostInr: landed, profitInr: Number(profit.toFixed(2)), marginPct: Number(margin.toFixed(2)), collection, garmentColor, placement, createdBy: admin.id }), admin.id]);
    await client.query("COMMIT");

    return NextResponse.json({
      status: "CEO_PENDING",
      productId,
      sku,
      title,
      brand,
      line: band.line,
      images,
      production: rate,
      designState: { garmentColor, placement },
      economics: { targetPriceInr: target, landedCostInr: landed, profitInr: Number(profit.toFixed(2)), marginPct: Number(margin.toFixed(2)), policy: economicsPolicy },
      nextStage: "CEO review -> listing gate -> storefront",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Fashion design transaction failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Design could not be saved. No partial design was committed." }, { status: 500 });
  } finally { client.release(); }
}
