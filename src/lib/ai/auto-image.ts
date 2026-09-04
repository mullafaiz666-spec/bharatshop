import { pool } from "@/db";
import { planAutomaticImageStyle } from "@/lib/ai/image-style-engine";

async function product(productId?: number, productName?: string) {
  if (productId) return (await pool.query(`SELECT id,title,brand,category,image_url FROM products WHERE id=$1 LIMIT 1`, [productId])).rows[0] || null;
  if (productName) return (await pool.query(`SELECT id,title,brand,category,image_url FROM products WHERE title ILIKE $1 ORDER BY id LIMIT 1`, [`%${productName}%`])).rows[0] || null;
  return null;
}
async function referenceImage(productId: number, fallback?: string) {
  const r = await pool.query(`SELECT image_url FROM product_images WHERE product_id=$1 AND image_url IS NOT NULL ORDER BY sort_order LIMIT 1`, [productId]);
  return r.rows[0]?.image_url || fallback;
}
async function generate(prompt: string, source?: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  if (source && /^https?:\/\//i.test(source)) {
    try { const r = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(12000) }); if (r.ok) form.append("image", new Blob([await r.arrayBuffer()], { type: r.headers.get("content-type") || "image/jpeg" }), "product-reference.jpg"); } catch {}
  }
  const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(90000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Image provider ${r.status}: ${text.slice(0, 500)}`);
  const item = JSON.parse(text)?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error("Image provider returned no image");
}
export async function runAutomaticProductImage(input: { productId?: number; productName?: string; count?: number; purpose?: "catalog" | "ad" | "social" | "lifestyle" | "fashion"; extraPrompt?: string }) {
  const p = await product(input.productId, input.productName);
  if (!p) return { success: false, error: "Product was not found in the catalogue" };
  const plan = planAutomaticImageStyle({ title: p.title, brand: p.brand, category: p.category, purpose: input.purpose });
  const count = Math.max(1, Math.min(4, Number(input.count || 2)));
  const source = await referenceImage(p.id, p.image_url);
  const images: string[] = [];
  for (let i = 0; i < count; i++) images.push(await generate(`${plan.prompt}\nVariation ${i + 1} of ${count}. ${input.extraPrompt || ""}\nProduct: ${p.title}; brand ${p.brand}; category ${p.category}`, source));
  const start = Number((await pool.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM product_images WHERE product_id=$1`, [p.id])).rows[0]?.n || 0);
  await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) SELECT $1,x,'AI_GENERATED',$2 + ord-1,$3 || ' variation ' || ord,'AI_GENERATED' FROM unnest($4::text[]) WITH ORDINALITY AS t(x,ord)`, [p.id, start, plan.productType, images]);
  await pool.query(`UPDATE products SET image_url=$1,updated_at=NOW() WHERE id=$2`, [images[0], p.id]);
  try { await pool.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'Image & Media','AUTO_IMAGE_GENERATION',$1,$2,'SUCCESS')`, [`Automatic ${plan.productType} image generation for product ${p.id}`, JSON.stringify({ productId: p.id, plan, generated: images.length })]); } catch {}
  return { success: true, productId: p.id, product: p.title, generated: images.length, images, provider: "openai-images", plan, persisted: true };
}
