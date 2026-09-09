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

function localArtFallback(req: Request, productId: number, view: number, reason: string) {
  const target = new URL(`/api/fashion-art/${productId}/${view}`, req.url);
  target.searchParams.set("fallback", reason);
  return new Response(null, {
    status: 307,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "X-Fashion-Image-Fallback": reason,
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ productId: string; view: string }> }) {
  const { productId, view } = await params;
  const id = Number(productId);
  const v = Number(view);
  if (!Number.isInteger(id) || !Number.isInteger(v) || v < 0 || v > 3) {
    return new Response("Invalid image", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT c.mime_type,c.image_bytes,c.provider,c.created_at
       FROM fashion_media_cache c
       JOIN products p ON p.id=c.product_id
       WHERE c.product_id=$1 AND c.view=$2 AND p.status='Published' LIMIT 1`,
      [id, v]
    );
    const row = result.rows[0];
    const mimeType = String(row?.mime_type || "");
    const byteLength = Number(row?.image_bytes?.length || 0);

    // A product_images row can outlive its cached editorial bytes. Never expose a broken
    // image in that case: the deterministic local fashion-art route is always the safe fallback.
    if (!row?.image_bytes || byteLength < 32 || !mimeType.startsWith("image/")) {
      return localArtFallback(req, id, v, "cache-miss");
    }

    const style = new URL(req.url).searchParams.get("style") || "legacy";
    const createdAt = new Date(row.created_at);
    return new Response(row.image_bytes, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=300, must-revalidate",
        ...(Number.isNaN(createdAt.getTime()) ? {} : { "Last-Modified": createdAt.toUTCString() }),
        "X-Fashion-Image-Provider": String(row.provider || "editorial-ai"),
        "X-Fashion-Style": style,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("fashion-photo cache read failed; using deterministic fallback", {
      productId: id,
      view: v,
      error: error instanceof Error ? error.message : String(error),
    });
    return localArtFallback(req, id, v, "cache-error");
  }
}
