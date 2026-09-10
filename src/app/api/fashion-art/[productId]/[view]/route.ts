import { pool } from "@/db";
import { generateLocalEditorialRaster } from "@/lib/fashion/local-editorial-raster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string; view: string }> },
) {
  const { productId, view } = await params;
  const id = Number(productId);
  const parsedView = Number(view);
  const selectedView = Math.max(0, Math.min(3, Number.isFinite(parsedView) ? parsedView : 0));

  if (!Number.isFinite(id) || id <= 0) {
    return new Response("Invalid product", { status: 400 });
  }

  const result = await pool.query(
    `SELECT p.title, p.category, p.brand, d.specifications_json
       FROM products p
       LEFT JOIN product_details d ON d.product_id = p.id
      WHERE p.id = $1 AND p.status = 'Published'
      LIMIT 1`,
    [id],
  );

  if (!result.rows[0]) {
    return new Response("Not found", { status: 404 });
  }

  const row = result.rows[0];
  const specs = jsonObject(row.specifications_json);
  const palette = Array.isArray(specs.palette) ? specs.palette : [];
  const image = generateLocalEditorialRaster({
    productId: id,
    title: String(row.title || row.category || row.brand || `Fashion ${id}`),
    view: selectedView,
    palette,
    width: 480,
    height: 600,
  });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.bytes.length),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "X-BharatShop-Fashion-Provider": image.provider,
      "X-BharatShop-Fashion-View": String(selectedView),
    },
  });
}
