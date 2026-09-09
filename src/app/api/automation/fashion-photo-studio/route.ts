import { NextResponse } from "next/server";
import { pool } from "@/db";
import { generateEditorialImage } from "@/lib/fashion/editorial-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STYLE_VERSION = "drip-realworld-v4";
const LOCAL_PROVIDER = "bharatshop-local-raster";

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS fashion_media_cache (
    product_id BIGINT NOT NULL,
    view SMALLINT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/webp',
    image_bytes BYTEA NOT NULL,
    provider TEXT NOT NULL,
    prompt TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, view)
  )`);
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function publicOrigin(req: Request) {
  for (const value of [process.env.PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.RENDER_EXTERNAL_URL, new URL(req.url).origin, "https://bharatshop-9w4a.onrender.com"]) {
    try {
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol === "https:" && !/^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i.test(url.hostname)) return url.origin;
    } catch {}
  }
  return "https://bharatshop-9w4a.onrender.com";
}

function editorialPrompt(row: any, specs: Record<string, any>, view: number) {
  const brand = String(specs.designOrigin || row.brand || "BharatShop Studio");
  const title = String(row.title || `${brand} streetwear`);
  const garment = String(specs.qikinkProductName || "oversized heavyweight t-shirt");
  const brief = String(specs.designBrief || "original minimal streetwear graphic");
  const palette = Array.isArray(specs.palette) ? specs.palette.join(", ") : "black, charcoal, white, one electric accent";
  const back = view === 2;
  const scenes = [
    "outside a real independent Indian streetwear or thrift shop with racks visible behind the subject",
    "busy urban lane with textured shutters, concrete, scooters and believable city depth",
    "city sidewalk beside a fashion store in late-afternoon natural light",
    "raw concrete parking deck with distant buildings and documentary street-fashion atmosphere",
    "night market street with shop lights, wet pavement reflections and realistic depth",
  ];
  const scene = scenes[Math.abs((Number(row.id) || 0) * 11 + view * 17) % scenes.length];
  return [
    `${brand} style=${STYLE_VERSION}.`,
    "PHOTOREALISTIC REAL HUMAN FASHION PHOTO ONLY. No illustration, vector art, pixel art, mannequin, 3D render, game character or synthetic cutout look.",
    "Contemporary drip/streetwear styling inspired by real street-fashion photography: oversized graphic tee or hoodie, very baggy washed denim or parachute cargos, stacked hems, clean chunky sneakers, subtle chain/cap/crossbody details.",
    "Fictional adult Indian fashion model age 20-28, natural skin texture, realistic hair, realistic hands and proportions, confident candid expression, non-celebrity.",
    back ? "Three-quarter rear full-body pose with the back of the garment clearly visible." : "Front or three-quarter full-body fashion pose, slightly low camera angle, one foot offset, natural relaxed confidence.",
    `Hero garment: ${garment}; realistic heavyweight cotton drape, oversized drop shoulders, premium streetwear fit.`,
    `Product concept: ${title}. Original ${brand} artwork direction: ${brief}. Palette: ${palette}.`,
    back ? "Keep a clean original back graphic area as the garment focal point." : "Keep the front artwork area crisp, tasteful and visible; do not invent third-party logos or licensed characters.",
    `Real-world location: ${scene}.`,
    "Use high-quality smartphone/DSLR fashion photography, 35mm equivalent lens, believable depth of field, fabric texture, natural shadows, punchy but realistic contrast and subtle grain.",
    "The result should resemble an authentic social-commerce streetwear shoot like modern baggy-jeans, hoodie and oversized-tee outfit inspiration, not a product mockup on a white background.",
    "No readable third-party brand logos, copyrighted characters, celebrity likeness, watermark, malformed fingers, duplicate limbs or gibberish typography.",
  ].join(" ");
}

async function attachPublicMedia(productId: number, view: number, title: string, specs: Record<string, any>, origin: string, provider: string) {
  const local = provider === LOCAL_PROVIDER;
  const publicUrl = local
    ? `${origin}/api/fashion-art/${productId}/${view}?style=${STYLE_VERSION}&fallback=product-mockup`
    : `${origin}/api/fashion-photo/${productId}/${view}?style=${STYLE_VERSION}`;
  const status = local ? "AI_GENERATED_ORIGINAL" : "AI_GENERATED_EDITORIAL";
  const verificationProvider = local ? "bharatshop-studio" : provider;
  const model = local ? "bharatshop-product-mockup-v2" : "free-photoreal-generator";
  const metadata = JSON.stringify({
    fictionalModel: !local,
    editorialPreview: !local,
    styleVersion: STYLE_VERSION,
    referenceDirection: "real-world-drip-streetwear",
    productionTruth: "Qikink garment/design placement",
    photorealUpgradePending: local,
    representation: local ? "original-product-design-mockup" : "ai-photoreal-editorial",
  });
  const updated = await pool.query(
    `UPDATE product_images SET image_url=$3,verification_status=$4,verification_confidence=1,verification_model=$5,verification_provider=$6,verification_metadata=$7,verified_at=NOW() WHERE product_id=$1 AND sort_order=$2`,
    [productId, view, publicUrl, status, model, verificationProvider, metadata]
  );
  if (!updated.rowCount) {
    const sourceUrl = String(specs.qikinkSourceUrl || specs.qikinkRateSource || "https://qikink.com/");
    await pool.query(
      `INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,NOW())`,
      [productId, publicUrl, sourceUrl, view, `${title} ${view === 2 ? "back" : "front"} view`, status, model, verificationProvider, metadata]
    );
  }
  return publicUrl;
}

async function storeMedia(input: { productId: number; view: number; mimeType: string; bytes: Buffer; provider: string; prompt: string; sourceUrl: string }) {
  await pool.query(
    `INSERT INTO fashion_media_cache (product_id,view,mime_type,image_bytes,provider,prompt,source_url,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (product_id,view) DO UPDATE SET mime_type=EXCLUDED.mime_type,image_bytes=EXCLUDED.image_bytes,provider=EXCLUDED.provider,prompt=EXCLUDED.prompt,source_url=EXCLUDED.source_url,created_at=NOW()`,
    [input.productId, input.view, input.mimeType, input.bytes, input.provider, input.prompt, input.sourceUrl]
  );
}

function requestedViews(body: any): number[] {
  const raw: number[] = Array.isArray(body?.views) ? body.views.map(Number) : [0];
  const views: number[] = [...new Set<number>(raw.filter((x: number) => x === 0 || x === 2))];
  return views.length ? views : [0];
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const body = await req.json().catch(() => ({}));
  const views: number[] = requestedViews(body);
  const productLimit = Math.max(1, Math.min(12, Number(body.productLimit ?? 6)));
  const externalAttemptLimit = Math.max(1, Math.min(12, Number(body.externalAttemptLimit ?? productLimit * views.length)));
  const rows = await pool.query(
    `SELECT p.id,p.title,p.brand,p.category,d.specifications_json,COALESCE(c.provider,'') AS front_provider,COALESCE(c.prompt,'') AS front_prompt
     FROM products p JOIN product_details d ON d.product_id=p.id
     LEFT JOIN fashion_media_cache c ON c.product_id=p.id AND c.view=0
     WHERE p.status='Published'
       AND LOWER(COALESCE(d.specifications_json->>'designOrigin',p.brand,'')) IN ('bharatdrip','bharatshop studio')
       AND UPPER(COALESCE(d.specifications_json->>'inventoryMode',''))='MADE_TO_ORDER'
       AND LOWER(COALESCE(d.specifications_json->>'productionSupplier',''))='qikink'
       AND COALESCE(d.specifications_json->>'qikinkProductCode','')<>''
     ORDER BY CASE WHEN COALESCE(c.provider,'')=$1 OR COALESCE(c.prompt,'') NOT LIKE $2 THEN 0 ELSE 1 END,p.updated_at DESC,p.id DESC
     LIMIT $3`,
    [LOCAL_PROVIDER, `%style=${STYLE_VERSION}%`, productLimit]
  );
  const origin = publicOrigin(req);
  const results: any[] = [];
  let attempted = 0, generated = 0, cached = 0, mockupFallbacks = 0;
  const deadline = Date.now() + 275_000;

  for (const view of views) {
    for (const row of rows.rows) {
      const specs = jsonObject(row.specifications_json);
      const prompt = editorialPrompt(row, specs, view);
      const existing = await pool.query(`SELECT provider,prompt FROM fashion_media_cache WHERE product_id=$1 AND view=$2 LIMIT 1`, [row.id, view]);
      const existingProvider = String(existing.rows[0]?.provider || "");
      const currentPhotoreal = Boolean(existing.rows[0]) && existingProvider !== LOCAL_PROVIDER && String(existing.rows[0]?.prompt || "").includes(`style=${STYLE_VERSION}`);
      if (currentPhotoreal) {
        const publicUrl = await attachPublicMedia(Number(row.id), view, String(row.title), specs, origin, existingProvider);
        cached++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "PHOTO_CACHED", provider: existingProvider, publicUrl });
        continue;
      }

      let image: { mimeType: string; bytes: Buffer; provider: string; sourceUrl: string } | null = null;
      let externalError = "";
      if (attempted < externalAttemptLimit && Date.now() + 55_000 < deadline) {
        attempted++;
        try {
          image = await generateEditorialImage(prompt, { width: 768, height: 1024, timeoutMs: 105_000 });
        } catch (error) {
          externalError = error instanceof Error ? error.message : String(error);
        }
      }
      if (image) {
        await storeMedia({ productId: Number(row.id), view, mimeType: image.mimeType, bytes: image.bytes, provider: image.provider, prompt, sourceUrl: image.sourceUrl });
        const publicUrl = await attachPublicMedia(Number(row.id), view, String(row.title), specs, origin, image.provider);
        generated++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "PHOTOREAL_GENERATED", provider: image.provider, bytes: image.bytes.length, publicUrl });
      } else {
        const publicUrl = await attachPublicMedia(Number(row.id), view, String(row.title), specs, origin, LOCAL_PROVIDER);
        mockupFallbacks++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "PHOTOREAL_PENDING", provider: LOCAL_PROVIDER, publicUrl, externalError: externalError || "Attempt budget/deadline reached" });
      }
    }
  }

  const totals = await pool.query(
    `SELECT COUNT(*) FILTER (
              WHERE p.status='Published'
                AND LOWER(COALESCE(d.specifications_json->>'designOrigin',p.brand,'')) IN ('bharatdrip','bharatshop studio')
                AND UPPER(COALESCE(d.specifications_json->>'inventoryMode',''))='MADE_TO_ORDER'
                AND LOWER(COALESCE(d.specifications_json->>'productionSupplier',''))='qikink'
                AND COALESCE(d.specifications_json->>'qikinkProductCode','')<>''
            )::int AS total,
            COUNT(*) FILTER (
              WHERE p.status='Published'
                AND LOWER(COALESCE(d.specifications_json->>'designOrigin',p.brand,'')) IN ('bharatdrip','bharatshop studio')
                AND UPPER(COALESCE(d.specifications_json->>'inventoryMode',''))='MADE_TO_ORDER'
                AND LOWER(COALESCE(d.specifications_json->>'productionSupplier',''))='qikink'
                AND COALESCE(d.specifications_json->>'qikinkProductCode','')<>''
                AND c.provider IS NOT NULL AND c.provider<>$1 AND COALESCE(c.prompt,'') LIKE $2
            )::int AS photoreal
     FROM products p JOIN product_details d ON d.product_id=p.id LEFT JOIN fashion_media_cache c ON c.product_id=p.id AND c.view=0`,
    [LOCAL_PROVIDER, `%style=${STYLE_VERSION}%`]
  );
  const totalProducts = Number(totals.rows[0]?.total || 0), photorealFrontReady = Number(totals.rows[0]?.photoreal || 0);
  await pool.query(
    `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'Fashion Photo Studio','REALWORLD_STREETWEAR_REFRESH',$1,$2,$3)`,
    [`Made-to-order fashion ${STYLE_VERSION}: ${photorealFrontReady}/${totalProducts} published fashion cards now have real-human photoreal front media.`, JSON.stringify({ views, productLimit, attempted, generated, cached, mockupFallbacks, photorealFrontReady, totalProducts, results }), photorealFrontReady === totalProducts && totalProducts > 0 ? "SUCCESS" : "WARNING"]
  );
  return NextResponse.json({
    success: totalProducts > 0,
    status: photorealFrontReady === totalProducts && totalProducts > 0 ? "PHOTOREAL_READY" : "PHOTOREAL_PENDING",
    styleVersion: STYLE_VERSION,
    views,
    attempted,
    generated,
    cached,
    mockupFallbacks,
    photorealFrontReady,
    totalProducts,
    waitingPhotorealUpgrade: Math.max(0, totalProducts - photorealFrontReady),
    results,
  });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const count = await pool.query(
    `SELECT COUNT(*)::int AS cached_shots,COUNT(DISTINCT product_id)::int AS cached_products,COUNT(*) FILTER (WHERE provider<>$1 AND COALESCE(prompt,'') LIKE $2)::int AS photoreal_current FROM fashion_media_cache`,
    [LOCAL_PROVIDER, `%style=${STYLE_VERSION}%`]
  );
  return NextResponse.json({
    status: "READY",
    provider: "official-gradio-client / Hugging Face ZeroGPU",
    styleVersion: STYLE_VERSION,
    cachedShots: Number(count.rows[0]?.cached_shots || 0),
    cachedProducts: Number(count.rows[0]?.cached_products || 0),
    photorealCurrentShots: Number(count.rows[0]?.photoreal_current || 0),
    productionTruth: "Qikink garment/design mapping; non-photoreal mockups are kept internal until a verified photoreal front image is ready",
  });
}
