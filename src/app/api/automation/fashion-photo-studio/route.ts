import { NextResponse } from "next/server";
import { pool } from "@/db";
import { generateEditorialImage } from "@/lib/fashion/editorial-image";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const expected = process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN;
  if (!expected) return true;
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

function editorialPrompt(row: any, specs: Record<string, any>, view: number) {
  const title = String(row.title || "BharatDrip streetwear");
  const garment = String(specs.qikinkProductName || "oversized t-shirt");
  const brief = String(specs.designBrief || "original Gen Z streetwear graphic");
  const palette = Array.isArray(specs.palette) ? specs.palette.join(", ") : "black, white, electric accent";
  const back = view === 2;
  const pose = back
    ? "three-quarter rear view, model looking slightly over shoulder, back of garment fully visible"
    : "front three-quarter full-body view, garment chest and silhouette fully visible";
  return [
    "Photorealistic premium Indian Gen Z streetwear ecommerce campaign photography.",
    "Fictional adult fashion model age 20-28, contemporary Indian look, natural skin texture, confident relaxed pose.",
    `${pose}.`,
    `Wearing a ${garment} with a baggy oversized drop-shoulder streetwear fit, styled with loose cargo or wide-leg pants and clean sneakers.`,
    `BharatDrip product concept: ${title}. Original artwork direction: ${brief}.`,
    `Palette: ${palette}.`,
    back ? "Large original graphic composition is concentrated on the back panel." : "Small-to-medium original front graphic or crest; do not dominate the full shirt front unless the concept requires it.",
    "High-end urban editorial or minimal cyclorama studio, soft directional fashion lighting, realistic cotton fabric folds, realistic garment drape, sharp commercial photography, vertical 4:5 composition.",
    "No third-party logos, no copyrighted anime characters, no celebrity likeness, no gibberish text, no watermark, no extra limbs, no distorted hands.",
    "The aesthetic should feel like current drippy manga-inspired streetwear, but all artwork and characters must be original.",
  ].join(" ");
}

async function attachPublicPhoto(productId: number, view: number, title: string, specs: Record<string, any>, origin: string) {
  const publicUrl = `${origin}/api/fashion-photo/${productId}/${view}`;
  const updated = await pool.query(
    `UPDATE product_images
     SET image_url=$3,verification_status='AI_GENERATED_EDITORIAL',verification_confidence=1,verification_model='FLUX.1-schnell',verification_provider='hf-zerogpu',verified_at=NOW()
     WHERE product_id=$1 AND sort_order=$2`,
    [productId, view, publicUrl]
  );
  if (!updated.rowCount) {
    const sourceUrl = String(specs.qikinkSourceUrl || specs.qikinkRateSource || "https://qikink.com/");
    await pool.query(
      `INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at)
       VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_EDITORIAL',1,'FLUX.1-schnell','hf-zerogpu',$6,NOW())`,
      [productId, publicUrl, sourceUrl, view, `${title} ${view === 2 ? "back" : "front"} model editorial`, JSON.stringify({ fictionalModel: true, editorialPreview: true, productionTruth: "Qikink garment/design placement" })]
    );
  }
  return publicUrl;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(4, Number(body.limit || 2)));
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
  const origin = new URL(req.url).origin.replace(/\/$/, "");
  const results: any[] = [];
  let generated = 0;
  for (const row of rows.rows) {
    const specs = jsonObject(row.specifications_json);
    for (const view of [0, 2]) {
      const existing = await pool.query(`SELECT provider FROM fashion_media_cache WHERE product_id=$1 AND view=$2 LIMIT 1`, [row.id, view]);
      if (existing.rows[0]) {
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin);
        results.push({ productId: Number(row.id), title: row.title, view, status: "CACHED_REWIRED", publicUrl, provider: existing.rows[0].provider });
        continue;
      }
      if (generated >= limit * 2) continue;
      const prompt = editorialPrompt(row, specs, view);
      try {
        const image = await generateEditorialImage(prompt, { width: 768, height: 1024, timeoutMs: 110_000 });
        await pool.query(
          `INSERT INTO fashion_media_cache (product_id,view,mime_type,image_bytes,provider,prompt,source_url,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (product_id,view) DO UPDATE SET mime_type=EXCLUDED.mime_type,image_bytes=EXCLUDED.image_bytes,provider=EXCLUDED.provider,prompt=EXCLUDED.prompt,source_url=EXCLUDED.source_url,created_at=NOW()`,
          [row.id, view, image.mimeType, image.bytes, image.provider, prompt, image.sourceUrl]
        );
        const publicUrl = await attachPublicPhoto(Number(row.id), view, String(row.title), specs, origin);
        generated++;
        results.push({ productId: Number(row.id), title: row.title, view, status: "GENERATED", publicUrl, provider: image.provider, bytes: image.bytes.length });
      } catch (error) {
        results.push({ productId: Number(row.id), title: row.title, view, status: "DEFERRED_FREE_GPU", error: error instanceof Error ? error.message : String(error) });
        break;
      }
    }
  }
  const cachedRewired = results.filter((x) => x.status === "CACHED_REWIRED").length;
  await pool.query(
    `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
     VALUES (1,'BharatDrip Fashion Photo Studio','EDITORIAL_MODEL_SHOTS',$1,$2,$3)`,
    [generated || cachedRewired ? `Prepared ${generated + cachedRewired} BharatDrip model shot link(s); ${generated} newly generated.` : "Free GPU unavailable; kept production-safe mockup fallbacks.", JSON.stringify({ generated, cachedRewired, requestedProducts: limit, results }), generated || cachedRewired ? "SUCCESS" : "DEGRADED"]
  );
  return NextResponse.json({ success: true, provider: "free-first-hf-zerogpu", generated, cachedRewired, requestedProducts: limit, fallback: "BharatShop/Qikink-safe product mockups", results });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const count = await pool.query(`SELECT COUNT(*)::int AS count,COUNT(DISTINCT product_id)::int AS products FROM fashion_media_cache`);
  return NextResponse.json({ status: "READY", provider: "hf-zerogpu-flux1-schnell", cachedShots: Number(count.rows[0]?.count || 0), cachedProducts: Number(count.rows[0]?.products || 0), productionMockups: "Qikink free mockup generator remains production truth" });
}
