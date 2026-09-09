import { NextResponse } from "next/server";
import { pool } from "@/db";
import { generateEditorialImage } from "@/lib/fashion/editorial-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STYLE_VERSION = "drip-realworld-v3";
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
  const candidates = [process.env.PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.RENDER_EXTERNAL_URL, new URL(req.url).origin, "https://bharatshop-9w4a.onrender.com"];
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
    "real Indian streetwear shop or thrift-store frontage with garment racks and textured shutters in the background",
    "dense urban lane with concrete walls, layered legal poster textures, scooters and natural street depth but no readable third-party branding",
    "city sidewalk outside an independent fashion store, candid pedestrian depth, warm late-afternoon light",
    "industrial parking deck with raw concrete, railings and distant city buildings",
    "night market street with practical shop lights, wet-road reflections and realistic documentary ambience",
  ];
  const scene = scenes[Math.abs((Number(row.id) || 0) * 11 + view * 17) % scenes.length];
  const pose = back
    ? "full-body three-quarter rear fashion pose, shoulders relaxed, one foot offset, back print completely readable as artwork placement, realistic anatomy"
    : "full-body or knees-up candid street-fashion pose, slightly low camera angle, relaxed confident stance, garment silhouette and front artwork clearly visible, realistic anatomy";
  return [
    `BharatDrip style=${STYLE_VERSION}.`,
    "Create a REALISTIC fashion photograph, not an illustration, not vector art, not pixel art, not a game character, not a mannequin and not a 3D render.",
    "Visual direction is contemporary real-world drip/streetwear: oversized graphic tees and hoodies, wide baggy washed denim, parachute cargos or relaxed joggers, chunky clean sneakers, subtle chains or caps, and authentic urban styling.",
    "Fictional adult Indian model age 20-28 with natural skin texture, believable hair, realistic hands, realistic body proportions and an editorial but non-celebrity appearance.",
    pose + ".",
    `The hero garment is a ${garment} with a strong oversized drop-shoulder silhouette and realistic heavyweight cotton drape.`,
    `BharatDrip product: ${title}. Original design direction: ${brief}. Palette: ${palette}.`,
    back ? "Make the original BharatDrip back artwork the main garment focal point." : "Keep the original BharatDrip front artwork crisp and visible without inventing third-party logos or licensed characters.",
    `Location: ${scene}.`,
    "Camera treatment: high-quality smartphone/DSLR street-fashion photography, 35mm equivalent lens, realistic depth of field, detailed fabric texture, natural shadow direction, punchy but believable contrast, subtle film grain, no artificial plastic skin.",
    "Composition should resemble a strong social-commerce streetwear campaign: subject occupies most of a vertical 4:5 frame, real environment remains visible, outfit styling feels current and wearable, image should look like a genuine fashion shoot rather than an ecommerce cutout.",
    "STRICT NEGATIVE DIRECTION: no flat cartoon person, no blocky human, no vector illustration, no pixel-art city, no anime character, no mannequin, no blank generic tee, no duplicated limbs, no malformed fingers, no watermark, no readable third-party brand logo, no copied copyrighted graphic and no celebrity likeness.",
    "Use the supplied streetwear references only as high-level style direction for silhouette, baggy proportions, real-human photography and urban mood; do not reproduce any specific reference image, person, logo or garment design.",
  ].join(" ");
}

async function attachPublicPhoto(productId: number, view: number, title: string, specs: Record<string, any>, origin: string, provider: string) {
  const local = provider === LOCAL_PROVIDER;
  const publicUrl = local
    ? `${origin}/api/fashion-art/${productId}/${view}?style=${STYLE_VERSION}&fallback=product-mockup`
    : `${origin}/api/fashion-photo/${productId}/${view}?style=${STYLE_VERSION}`;
  const model = local ? "bharatshop-product-mockup-v2" : "free-photoreal-generator";
  const metadata = JSON.stringify({
    fictionalModel: !local,
    editorialPreview: !local,
    styleVersion: STYLE_VERSION,
    referenceDirection: "real-world-drip-streetwear",
    productionTruth: "Qikink garment/design placement",
    generatedRasterFallback: false,
    photorealUpgradePending: local,
    representation: local ? "original-product-design-mockup" : "ai-photoreal-editorial",
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
      [productId, publicUrl, sourceUrl, view, `${title} ${view === 2 ? "back" : "front"} BharatDrip product view`, model, provider, metadata]
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
  const externalAttemptLimit = Math.max(0, Math.min(6, Number(body.externalAttemptLimit ?? 5)));
  const rows = await pool.query(
    `SELECT p.id,p.title,p.brand,p.category,d.specifications_json,COALESCE(c.provider,'') AS front_provider
     FROM products p
     JOIN product_details d ON d.product_id=p.id
     LEFT JOIN fashion_media_cache c ON c.product_id=p.id AND c.view=0
     WHERE p.status='Published'
       AND p.brand='BharatDrip'
       AND COALESCE(d.specifications_json->>'designLine','')='DESIGNER'
     ORDER BY CASE WHEN COALESCE(c.provider,'')=$1 THEN 0 ELSE 1 END,p.updated_at DESC,p.id DESC
     LIMIT 24`,
    [LOCAL_PROVIDER]
  );
  const origin = publicOrigin(req);
  const results: any[] = [];
  let generated = 0;
  let externalGenerated = 0;
  let mockupFallbacks = 0;
  let attempted = 0;
  const deadline = Date.now() + 240_000;

  for (const view of [0, 2]) {
    for (const row of rows.rows) {
      const specs = jsonObject(row.specifications_json);
      const prompt = editorialPrompt(row, specs, view);
      const existing = await pool.query(`SELECT provider,prompt FROM fashion_media_cache WHERE product_id=$1 AND view=$2 LIMIT 1`, [row.id, view]);
      const existingProvider = String(existing.rows[0]?.provider || "");
      const styleMatches = Boolean(existing.rows[0]) && String(existing.rows[0]?.prompt || "").includes(`style=${STYLE_VERSION}`);
      const alreadyPhotoreal = styleMatches && existingProvider && existingProvider !== LOCAL_PROVIDER;
      if (alreadyPhotoreal) {
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin, existingProvider);
        results.push({ productId: Number(row.id), title: row.title, view, status: "PHOTO_CACHED", publicUrl, provider: existingProvider, styleVersion: STYLE_VERSION });
        continue;
      }

      let image: { mimeType: string; bytes: Buffer; provider: string; sourceUrl: string } | null = null;
      let externalError = "";
      if (attempted < externalAttemptLimit && Date.now() + 38_000 < deadline) {
        attempted++;
        try {
          image = await generateEditorialImage(prompt, { width: 768, height: 1024, timeoutMs: 35_000 });
          externalGenerated++;
        } catch (error) {
          externalError = error instanceof Error ? error.message : String(error);
        }
      }

      if (image) {
        await storeMedia({ productId: Number(row.id), view, mimeType: image.mimeType, bytes: image.bytes, provider: image.provider, prompt, sourceUrl: image.sourceUrl });
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin, image.provider);
        generated++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "PHOTOREAL_GENERATED", publicUrl, provider: image.provider, bytes: image.bytes.length, styleVersion: STYLE_VERSION });
      } else {
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin, LOCAL_PROVIDER);
        mockupFallbacks++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "PRODUCT_MOCKUP_FALLBACK", publicUrl, provider: LOCAL_PROVIDER, styleVersion: STYLE_VERSION, photorealUpgradePending: true, ...(externalError ? { externalError } : {}) });
      }
    }
  }

  const photorealFrontReady = new Set(results.filter((x) => x.view === 0 && ["PHOTOREAL_GENERATED", "PHOTO_CACHED"].includes(x.status)).map((x) => x.productId)).size;
  const totalProducts = rows.rows.length;
  await pool.query(
    `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
     VALUES (1,'BharatDrip Fashion Photo Studio','REALWORLD_STREETWEAR_REFRESH',$1,$2,$3)`,
    [
      `BharatDrip ${STYLE_VERSION}: ${photorealFrontReady}/${totalProducts} front cards have real-world photoreal editorial media; remaining cards use truthful product mockups and stay queued for free-generator upgrade.`,
      JSON.stringify({ styleVersion: STYLE_VERSION, externalGenerated, generated, mockupFallbacks, attempted, photorealFrontReady, totalProducts, results }),
      photorealFrontReady === totalProducts && totalProducts > 0 ? "SUCCESS" : "WARNING",
    ]
  );
  return NextResponse.json({
    success: totalProducts > 0,
    status: photorealFrontReady === totalProducts && totalProducts > 0 ? "PHOTOREAL_READY" : "UPGRADE_IN_PROGRESS",
    attempted,
    provider: "free-photoreal-with-product-mockup-fallback",
    styleVersion: STYLE_VERSION,
    referenceDirection: "real human streetwear / oversized drip / baggy denim-cargo / urban fashion photography",
    generated,
    externalGenerated,
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
  const count = await pool.query(`SELECT COUNT(*)::int AS count,COUNT(DISTINCT product_id)::int AS products,COUNT(*) FILTER (WHERE provider<>$1)::int AS photoreal FROM fashion_media_cache`, [LOCAL_PROVIDER]);
  return NextResponse.json({
    status: "READY",
    provider: "free-photoreal-with-product-mockup-fallback",
    styleVersion: STYLE_VERSION,
    cachedShots: Number(count.rows[0]?.count || 0),
    cachedProducts: Number(count.rows[0]?.products || 0),
    photorealCachedShots: Number(count.rows[0]?.photoreal || 0),
    productionMockups: "Qikink garment/design mapping remains production truth",
  });
}
