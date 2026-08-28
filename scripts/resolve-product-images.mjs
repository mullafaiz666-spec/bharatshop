import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const BATCH_SIZE = Math.max(1, Math.min(20, Number(process.env.IMAGE_RESOLVE_BATCH || 10)));
const PLACEHOLDER = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|watch|jewellery|jewelry)/i;
const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free"]);

function tokens(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)); }
function score(item, product) {
  const title = tokens(product.title);
  const hay = `${item.title || ""} ${item.source || ""} ${item.link || ""}`.toLowerCase();
  const hits = title.filter(t => hay.includes(t)).length;
  const ratio = title.length ? hits / title.length : 0;
  const brand = String(product.brand || "").trim().toLowerCase();
  const brandHit = brand && brand !== "generic" && hay.includes(brand) ? 0.25 : 0;
  return ratio + brandHit;
}
async function searchImages(q) {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_images");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "in");
  u.searchParams.set("api_key", SERPAPI_KEY);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`SerpAPI ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.images_results) ? d.images_results : [];
}

async function main() {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_API_KEY is required for image resolution");
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT p.id,p.title,p.brand,p.category,p.image_url
      FROM products p
      WHERE p.status='Published'
        AND NOT EXISTS (
          SELECT 1 FROM product_images pi
          WHERE pi.product_id=p.id
            AND pi.verification_status='WEB_IMAGE_EXACT_MATCH'
            AND pi.image_url !~* '(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)'
        )
      ORDER BY p.ai_score DESC, p.id ASC
      LIMIT $1`, [BATCH_SIZE]);
    let resolved = 0, rejected = 0;
    for (const p of rows) {
      const fashion = FASHION.test(`${p.category} ${p.title}`);
      const variant = fashion ? `${p.title} ${p.brand !== "Generic" ? p.brand : ""} exact product official supplier image` : `${p.title} ${p.brand !== "Generic" ? p.brand : ""} product official supplier image`;
      let results = [];
      try { results = await searchImages(variant); } catch (e) { console.error(`image search failed ${p.id}: ${e.message}`); continue; }
      const candidates = results
        .filter(x => x.original && /^https?:\/\//i.test(x.original) && !PLACEHOLDER.test(x.original))
        .map(x => ({ ...x, score: score(x, p) }))
        .sort((a,b) => b.score-a.score);
      const minScore = fashion ? 0.70 : 0.45;
      const best = candidates[0];
      if (!best || best.score < minScore || !best.link) { rejected++; console.log(JSON.stringify({productId:p.id,status:"NO_EXACT_IMAGE",score:best?.score||0,fashion})); continue; }
      await client.query("BEGIN");
      await client.query(`DELETE FROM product_images WHERE product_id=$1 AND verification_status='WEB_IMAGE_EXACT_MATCH'`, [p.id]);
      await client.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) VALUES ($1,$2,$3,0,$4,'WEB_IMAGE_EXACT_MATCH')`, [p.id,best.original,best.link,best.title || p.title]);
      await client.query(`UPDATE products SET image_url=$2, updated_at=NOW() WHERE id=$1`, [p.id,best.original]);
      await client.query("COMMIT");
      resolved++;
      console.log(JSON.stringify({productId:p.id,status:"EXACT_IMAGE_RESOLVED",score:Number(best.score.toFixed(3)),fashion,source:best.link}));
    }
    console.log(JSON.stringify({status:"COMPLETED",processed:rows.length,resolved,rejected,batchSize:BATCH_SIZE}));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
