import { pool } from "@/db";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request, { params }: { params: Promise<{ productId: string; view: string }> }) {
  const { productId, view } = await params;
  const id = Number(productId);
  const v = Number(view);
  if (!Number.isInteger(id) || !Number.isInteger(v) || v < 0 || v > 3) return new Response("Invalid image", { status: 400 });
  await ensureTable();
  const result = await pool.query(
    `SELECT c.mime_type,c.image_bytes,c.provider,c.created_at
     FROM fashion_media_cache c
     JOIN products p ON p.id=c.product_id
     WHERE c.product_id=$1 AND c.view=$2 AND p.status='Published' LIMIT 1`,
    [id, v]
  );
  const row = result.rows[0];
  if (!row?.image_bytes) return new Response("Not found", { status: 404 });
  const style = new URL(req.url).searchParams.get("style") || "legacy";
  const createdAt = new Date(row.created_at);
  return new Response(row.image_bytes, {
    headers: {
      "Content-Type": String(row.mime_type || "image/webp"),
      "Cache-Control": "public, max-age=300, must-revalidate",
      ...(Number.isNaN(createdAt.getTime()) ? {} : { "Last-Modified": createdAt.toUTCString() }),
      "X-Fashion-Image-Provider": String(row.provider || "editorial-ai"),
      "X-Fashion-Style": style,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
