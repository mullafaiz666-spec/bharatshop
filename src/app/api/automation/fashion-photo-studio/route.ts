import { NextResponse } from "next/server";
import { pool } from "@/db";
import { generateEditorialImage } from "@/lib/fashion/editorial-image";
import { generateLocalEditorialRaster } from "@/lib/fashion/local-editorial-raster";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STYLE_VERSION = "street-editorial-v2";
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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function publicOrigin(req: Request) {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.RENDER_EXTERNAL_URL,
    new URL(req.url).origin,
    "https://bharatshop-9w4a.onrender.com",
  ];
  for (const value of candidates) {
    try {
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol !== "https:") continue;
      if (/^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i.test(url.hostname)) continue;
      return url.origin;
    } catch {}
  }
  return "https://bharatshop-9w4a.onrender.com";
}

function editorialPrompt(row: any, specs: Record<string, any>, view: number) {
  const title = String(row.title || "BharatDrip streetwear");
  const garment = String(specs.qikinkProductName || "oversized t-shirt");
  const brief = String(specs.designBrief || "original Gen Z streetwear graphic");
  const palette = Array.isArray(specs.palette) ? specs.palette.join(", ") : "black, white, electric accent";
  const back = view === 2;
  const scenes = [
    "gritty Indian metro underpass with concrete texture, layered posters with no readable brands, cinematic depth and a few practical lights",
    "city rooftop parking deck at late afternoon with railings, distant skyline and warm directional sunlight",
    "urban lane with metal shutters, textured walls and colorful ambient light, no visible commercial logos",
    "independent streetwear boutique interior with blurred garment racks, polished concrete and practical ceiling light",
    "night street corner with wet pavement reflections, subtle neon ambience and documentary-style city depth",
  ];
  const sceneIndex = Math.abs((Number(row.id) || 0) * 7 + view * 13) % scenes.length;
  const scene = scenes[sceneIndex];
  const pose = back
    ? "dynamic three-quarter rear full-body view, torso slightly turned, one hand relaxed near pocket, model glancing over shoulder, back graphic clearly visible"
    : "low-angle front three-quarter full-body hero shot, one foot forward as if mid-step, relaxed shoulders, confident direct gaze, garment chest and oversized silhouette clearly visible";
  return [
    `BharatDrip style=${STYLE_VERSION}.`,
    "Photorealistic premium Indian Gen Z streetwear campaign photography with strong personality, not a plain catalog portrait.",
    "Fictional adult fashion model age 20-28, contemporary Indian look, textured styled hair, natural skin texture, confident expressive face and effortless street attitude.",
    `${pose}.`,
    `Wearing a ${garment} with an intentional oversized drop-shoulder streetwear fit, styled with washed baggy denim or parachute cargos, stacked hems and clean chunky sneakers.`,
    "Add one or two subtle styling details only: silver chain, rings, beanie, cap, crossbody bag or narrow sunglasses; no visible third-party branding.",
    `BharatDrip product concept: ${title}. Original artwork direction: ${brief}.`,
    `Palette: ${palette}.`,
    back
      ? "The large original artwork is concentrated on the back panel and remains the visual focus of the garment."
      : "Keep the front artwork intentional and graphic-led; preserve a strong fashion silhouette and do not turn the shirt into a generic blank.",
    `Scene: ${scene}.`,
    "Use punchy on-camera flash mixed with ambient city light, crisp contrast, deep blacks, realistic highlight roll-off, subtle 35mm film grain and saturated-but-believable color.",
    "Editorial framing should feel candid and current: handheld 35mm fashion look, slight low angle, subject filling most of a vertical 4:5 frame, visible environment depth and clean garment readability.",
    "Avoid dull grey cyclorama, passport-photo posing, mannequin stiffness, washed-out lighting, flat beige backgrounds and generic corporate ecommerce styling.",
    "No third-party logos, no copied brand marks, no copyrighted anime characters, no celebrity likeness, no gibberish readable text, no watermark, no extra limbs and no distorted hands.",
    "The mood is bold Y2K-meets-modern streetwear: oversized proportions, graphic personality, utility bottoms and urban styling, while all artwork and characters remain original to BharatDrip.",
  ].join(" ");
}

async function attachPublicPhoto(productId: number, view: number, title: string, specs: Record<string, any>, origin: string, provider: string) {
  const publicUrl = `${origin}/api/fashion-photo/${productId}/${view}?style=${STYLE_VERSION}`;
  const local = provider === LOCAL_PROVIDER;
  const model = local ? "bharatshop-local-raster-v1" : "FLUX.1-schnell";
  const metadata = JSON.stringify({
    fictionalModel: true,
    editorialPreview: true,
    styleVersion: STYLE_VERSION,
    productionTruth: "Qikink garment/design placement",
    generatedRasterFallback: local,
    representation: local ? "stylized-illustrated-editorial" : "ai-photoreal-editorial",
  });
  const updated = await pool.query(
    `UPDATE product_images
     SET image_url=$3,verification_status='AI_GENERATED_EDITORIAL',verification_confidence=1,verification_model=$4,verification_provider=$5,verification_metadata=$6,verified_at=NOW()
     WHERE product_id=$1 AND sort_order=$2`,
    [productId, view, publicUrl, model, provider, metadata]
  );
  if (!updated.rowCount) {
    const sourceUrl = String(specs.qikinkSourceUrl || specs.qikinkRateSource || "https://qikink.com/");
    await pool.query(
      `INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at)
       VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_EDITORIAL',1,$6,$7,$8,NOW())`,
      [productId, publicUrl, sourceUrl, view, `${title} ${view === 2 ? "back" : "front"} generated urban editorial`, model, provider, metadata]
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

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const body = await req.json().catch(() => ({}));
  const externalAttemptLimit = Math.max(0, Math.min(2, Number(body.externalAttemptLimit ?? 2)));
  const rows = await pool.query(
    `SELECT p.id,p.title,p.brand,p.category,d.specifications_json
     FROM products p
     JOIN product_details d ON d.product_id=p.id
     WHERE p.status='Published'
       AND p.brand='BharatDrip'
       AND COALESCE(d.specifications_json->>'designLine','')='DESIGNER'
     ORDER BY p.updated_at DESC,p.id DESC
     LIMIT 24`
  );
  const origin = publicOrigin(req);
  const results: any[] = [];
  let generated = 0;
  let externalGenerated = 0;
  let localGenerated = 0;
  let attempted = 0;
  const deadline = Date.now() + 240_000;

  for (const view of [0, 2]) {
    for (const row of rows.rows) {
      const specs = jsonObject(row.specifications_json);
      const prompt = editorialPrompt(row, specs, view);
      const existing = await pool.query(`SELECT provider,prompt FROM fashion_media_cache WHERE product_id=$1 AND view=$2 LIMIT 1`, [row.id, view]);
      const existingProvider = String(existing.rows[0]?.provider || "");
      const styleMatches = Boolean(existing.rows[0]) && String(existing.rows[0]?.prompt || "").includes(`style=${STYLE_VERSION}`);
      const shouldTryExternalUpgrade = styleMatches && existingProvider === LOCAL_PROVIDER && externalAttemptLimit > 0 && attempted < externalAttemptLimit && Date.now() + 50_000 < deadline;
      const currentStyle = styleMatches && !shouldTryExternalUpgrade;
      if (currentStyle) {
        const provider = existingProvider || LOCAL_PROVIDER;
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin, provider);
        results.push({ productId: Number(row.id), title: row.title, view, status: "CACHED_REWIRED", publicUrl, provider, styleVersion: STYLE_VERSION });
        continue;
      }

      let image: { mimeType: string; bytes: Buffer; provider: string; sourceUrl: string } | null = null;
      let externalError = "";
      if (attempted < externalAttemptLimit && Date.now() + 50_000 < deadline) {
        attempted++;
        try {
          image = await generateEditorialImage(prompt, { width: 768, height: 1024, timeoutMs: 45_000 });
          externalGenerated++;
        } catch (error) {
          externalError = error instanceof Error ? error.message : String(error);
        }
      }

      let status = "GENERATED";
      if (!image) {
        const local = generateLocalEditorialRaster({
          productId: Number(row.id),
          title: String(row.title),
          view,
          palette: Array.isArray(specs.palette) ? specs.palette : [],
          width: 480,
          height: 600,
        });
        if (local.bytes.length <= 10_000) throw new Error(`Local editorial raster unexpectedly small for product ${row.id}: ${local.bytes.length} bytes`);
        image = local;
        localGenerated++;
        status = "LOCAL_RASTER_FALLBACK";
      }

      await storeMedia({ productId: Number(row.id), view, mimeType: image.mimeType, bytes: image.bytes, provider: image.provider, prompt, sourceUrl: image.sourceUrl });
      const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin, image.provider);
      generated++;
      results.push({
        productId: Number(row.id), title: row.title, view, status, publicUrl, provider: image.provider,
        bytes: image.bytes.length, styleVersion: STYLE_VERSION, ...(externalError ? { externalError } : {}),
      });
    }
  }

  const cachedRewired = results.filter((x) => x.status === "CACHED_REWIRED").length;
  const frontReady = new Set(results.filter((x) => x.view === 0 && ["GENERATED", "LOCAL_RASTER_FALLBACK", "CACHED_REWIRED"].includes(x.status)).map((x) => x.productId)).size;
  const totalProducts = rows.rows.length;
  await pool.query(
    `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
     VALUES (1,'BharatDrip Fashion Photo Studio','EDITORIAL_MODEL_SHOTS',$1,$2,$3)`,
    [
      `Prepared ${generated + cachedRewired} BharatDrip ${STYLE_VERSION} editorial raster link(s); ${frontReady}/${totalProducts} product card(s) have current-style front media.`,
      JSON.stringify({ styleVersion: STYLE_VERSION, generated, externalGenerated, localGenerated, cachedRewired, frontReady, totalProducts, results }),
      frontReady === totalProducts && totalProducts > 0 ? "SUCCESS" : "WARNING",
    ]
  );
  return NextResponse.json({
    success: totalProducts > 0 && frontReady === totalProducts,
    status: totalProducts > 0 && frontReady === totalProducts ? "READY" : "PARTIAL",
    attempted,
    provider: "free-external-with-local-raster-fallback",
    styleVersion: STYLE_VERSION,
    generated,
    externalGenerated,
    localGenerated,
    cachedRewired,
    frontReady,
    totalProducts,
    waitingRefresh: Math.max(0, totalProducts - frontReady),
    fallback: "Original BharatShop local stylized raster editorial; Qikink garment/design mapping remains production truth",
    results,
  });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const count = await pool.query(`SELECT COUNT(*)::int AS count,COUNT(DISTINCT product_id)::int AS products FROM fashion_media_cache`);
  return NextResponse.json({
    status: "READY",
    provider: "free-external-with-local-raster-fallback",
    styleVersion: STYLE_VERSION,
    cachedShots: Number(count.rows[0]?.count || 0),
    cachedProducts: Number(count.rows[0]?.products || 0),
    productionMockups: "Qikink free mockup generator remains production truth",
  });
}
