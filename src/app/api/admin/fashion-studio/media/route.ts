import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MANUAL_PROVIDER = "manual-fashion-studio-upload";

function sniffMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function ensureCacheTable() {
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

function publicOrigin(req: Request) {
  for (const value of [process.env.PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.RENDER_EXTERNAL_URL, new URL(req.url).origin]) {
    try {
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol === "https:" && !/^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) return url.origin;
    } catch {}
  }
  return "https://bharatshop-9w4a.onrender.com";
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const productId = Number(form.get("productId"));
  const view = Number(form.get("view") ?? 0);
  const file = form.get("file");
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "Valid productId is required" }, { status: 400 });
  if (![0, 1, 2, 3].includes(view)) return NextResponse.json({ error: "view must be 0, 1, 2, or 3" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  if (file.size < 256 || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image must be between 256 bytes and 8 MB" }, { status: 413 });

  const product = await pool.query(`
    SELECT p.id,p.title,p.status,p.brand,d.specifications_json
    FROM products p
    LEFT JOIN product_details d ON d.product_id=p.id
    WHERE p.id=$1
    LIMIT 1
  `, [productId]);
  const row = product.rows[0];
  if (!row) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const specs = row.specifications_json && typeof row.specifications_json === "object" ? row.specifications_json : {};
  const originName = String(specs.designOrigin || row.brand || "").toLowerCase();
  if (!["bharatdrip", "bharatshop studio"].includes(originName)) {
    return NextResponse.json({ error: "Manual Fashion Studio media is limited to BharatDrip/BharatShop Studio products" }, { status: 422 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return NextResponse.json({ error: "Only genuine JPG, PNG, and WebP raster images are accepted" }, { status: 415 });

  await ensureCacheTable();
  const prompt = `manual-product-photo; uploaded-by=${admin.id}; original-name=${String(file.name || "upload").slice(0, 120)}`;
  await pool.query(`
    INSERT INTO fashion_media_cache (product_id,view,mime_type,image_bytes,provider,prompt,source_url,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,'manual-upload',NOW())
    ON CONFLICT (product_id,view) DO UPDATE SET
      mime_type=EXCLUDED.mime_type,
      image_bytes=EXCLUDED.image_bytes,
      provider=EXCLUDED.provider,
      prompt=EXCLUDED.prompt,
      source_url=EXCLUDED.source_url,
      created_at=NOW()
  `, [productId, view, mimeType, bytes, MANUAL_PROVIDER, prompt]);

  const origin = publicOrigin(req);
  const imageUrl = `${origin}/api/fashion-photo/${productId}/${view}?source=manual`;
  const metadata = JSON.stringify({
    representation: "manual-raster-product-photo",
    manuallyUploaded: true,
    uploadedBy: { id: admin.id, name: admin.name, role: admin.role },
    mimeType,
    bytes: bytes.length,
    source: "fashion-studio",
  });

  const updated = await pool.query(`
    UPDATE product_images
    SET image_url=$3,
        verification_status='MANUAL_STUDIO_UPLOAD',
        verification_confidence=1,
        verification_model='manual-raster-v1',
        verification_provider=$4,
        verification_metadata=$5,
        verified_at=NOW()
    WHERE product_id=$1 AND sort_order=$2
  `, [productId, view, imageUrl, MANUAL_PROVIDER, metadata]);

  if (!updated.rowCount) {
    await pool.query(`
      INSERT INTO product_images (
        product_id,image_url,source_url,sort_order,alt_text,
        verification_status,verification_confidence,verification_model,
        verification_provider,verification_metadata,verified_at
      ) VALUES ($1,$2,'manual-upload',$3,$4,'MANUAL_STUDIO_UPLOAD',1,'manual-raster-v1',$5,$6,NOW())
    `, [productId, imageUrl, view, `${row.title} ${view === 2 ? "back" : "product"} photo`, MANUAL_PROVIDER, metadata]);
  }

  if (view === 0) await pool.query(`UPDATE products SET image_url=$2,updated_at=NOW() WHERE id=$1`, [productId, imageUrl]);

  await pool.query(`
    INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
    VALUES (1,'Fashion Designer Studio','MANUAL_PRODUCT_PHOTO_UPLOAD',$1,$2,'SUCCESS')
  `, [
    `${row.title} received a manually uploaded ${mimeType.replace("image/", "").toUpperCase()} product photo.`,
    JSON.stringify({ productId, view, mimeType, bytes: bytes.length, uploadedBy: admin.id }),
  ]);

  return NextResponse.json({
    status: "UPLOADED",
    productId,
    view,
    mimeType,
    bytes: bytes.length,
    imageUrl,
    priority: view === 0 ? "PRIMARY_PRODUCT_IMAGE" : "GALLERY_IMAGE",
  });
}
