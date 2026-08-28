import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const BATCH_SIZE = Math.max(1, Math.min(200, Number(process.env.IMAGE_RESOLVE_BATCH || 200)));
const PLACEHOLDER = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|stock-photo)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|lehenga|salwar|apparel|clothing|streetwear|oversized|hoodie|jogger|cargo|footwear|shoe|sandal)/i;
const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","official","product","image","supplier","brand"]);
function tokens(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)); }
function score(item, p) {
  const titleTokens = tokens(`${p.title} ${p.brand}`);
  const hay = `${item.title || ""} ${item.source || ""} ${item.link || ""}`.toLowerCase();
  const productTokens = tokens(p.title);
  const hits = titleTokens.filter(t => hay.includes(t)).length;
  const productHits = productTokens.filter(t => hay.includes(t)).length;
  const ratio = titleTokens.length ? hits / titleTokens.length : 0;
  const brand = String(p.brand || "").trim().toLowerCase();
  const brandHit = brand && brand !== "generic" && hay.includes(brand);
  // Prefer exact brand + at least one product token, but allow strong title matches for generic/no-brand products.
  if (brandHit && productHits >= 1) return ratio + 0.45;
  if (!brandHit && ratio >= 0.40) return ratio;
  return 0;
}
async function searchImages(q) {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_images");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "in");
  u.searchParams.set("num", "20");
  u.searchParams.set("api_key", SERPAPI_KEY);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`SerpAPI ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.images_results) ? d.images_results : [];
}
async function main() {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_API_KEY is required");
  const client = await pool.connect();
  try {
    // Prioritize products that have no usable gallery, then products with fewer than 4 images.
    const { rows } = await client.query(`
      SELECT p.id,p.title,p.brand,p.category
      FROM products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) FILTER (WHERE verification_status='WEB_IMAGE_EXACT_MATCH') AS verified_images
        FROM product_images GROUP BY product_id
      ) pi ON pi.product_id=p.id
      WHERE p.status='Published' AND COALESCE(pi.verified_images,0) < 4
      ORDER BY COALESCE(pi.verified_images,0) ASC, p.ai_score DESC NULLS LAST, p.id ASC
      LIMIT $1`, [BATCH_SIZE]);

    let resolved = 0;
    for (const p of rows) {
      const fashion = FASHION.test(`${p.category} ${p.title}`);
      const base = `${p.brand && p.brand !== "Generic" ? p.brand + " " : ""}${p.title}`.trim();
      const queries = fashion
        ? [`"${base}" product`, `${base} official product images`, `${base} product photos front back`, `${base} colour variants`, `${base} packaging box size chart`]
        : [`"${base}" product`, `${base} official product images`, `${base} product photos front back`, `${base} packaging box accessories`];
      const candidates = [];
      for (const q of queries) {
        try { candidates.push(...await searchImages(q)); }
        catch (e) { console.error(`search failed ${p.id}: ${e.message}`); }
      }
      const unique = new Map();
      for (const x of candidates) {
        const u = String(x.original || x.thumbnail || "").trim();
        if (!/^https?:\/\//i.test(u) || PLACEHOLDER.test(u) || !x.link) continue;
        const s = score(x, p);
        if (s <= 0) continue;
        if (!unique.has(u)) unique.set(u, { ...x, score: s });
      }
      const best = [...unique.values()].sort((a,b) => b.score-a.score).slice(0,8);
      if (!best.length) {
        console.log(JSON.stringify({ productId:p.id, status:"NO_EXACT_IMAGES" }));
        continue;
      }
      await client.query("BEGIN");
      await client.query(`DELETE FROM product_images WHERE product_id=$1 AND verification_status='WEB_IMAGE_EXACT_MATCH'`, [p.id]);
      for (let i=0;i<best.length;i++) {
        const x=best[i];
        const label = fashion && i===0 ? "Product view" : fashion && i<4 ? "Style / variant view" : i<4 ? "Product view" : "Packaging / included items";
        await client.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) VALUES ($1,$2,$3,$4,$5,'WEB_IMAGE_EXACT_MATCH')`, [p.id,x.original || x.thumbnail,x.link,i,`${p.title} — ${label}`]);
      }
      await client.query(`UPDATE products SET image_url=$2,updated_at=NOW() WHERE id=$1`, [p.id,best[0].original || best[0].thumbnail]);
      await client.query("COMMIT");
      resolved++;
      console.log(JSON.stringify({ productId:p.id,status:"GALLERY_RESOLVED",images:best.length,fashion }));
    }
    console.log(JSON.stringify({ status:"COMPLETED",processed:rows.length,resolved,batchSize:BATCH_SIZE }));
  } finally { client.release(); await pool.end(); }
}
main().catch(e=>{console.error(e);process.exit(1)});
