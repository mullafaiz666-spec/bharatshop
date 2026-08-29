import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const SEARXNG_URL = String(process.env.SEARXNG_URL || process.env.IMAGE_SEARCH_URL || "https://bharatshop-searxng.onrender.com").replace(/\/$/, "");
const BATCH_SIZE = Math.max(1, Math.min(200, Number(process.env.IMAGE_RESOLVE_BATCH || 200)));
const PLACEHOLDER = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|stock-photo)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|lehenga|salwar|apparel|clothing|streetwear|oversized|hoodie|jogger|cargo|footwear|shoe|sandal)/i;
const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","official","product","image","images","supplier","brand"]);
function tokens(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)); }
function score(item, p) {
  const titleTokens = tokens(`${p.title} ${p.brand}`);
  const hay = `${item.title || ""} ${item.source || ""} ${item.sourceUrl || item.url || ""}`.toLowerCase();
  const productTokens = tokens(p.title);
  const hits = titleTokens.filter(t => hay.includes(t)).length;
  const productHits = productTokens.filter(t => hay.includes(t)).length;
  const ratio = titleTokens.length ? hits / titleTokens.length : 0;
  const brand = String(p.brand || "").trim().toLowerCase();
  const brandHit = brand && brand !== "generic" && hay.includes(brand);
  if (brandHit && productHits >= 1) return ratio + 0.45;
  if (!brandHit && ratio >= 0.40) return ratio;
  return 0;
}
async function searchImages(q) {
  const u = new URL(`${SEARXNG_URL}/search`);
  u.searchParams.set("q", q);
  u.searchParams.set("categories", "images");
  u.searchParams.set("format", "json");
  u.searchParams.set("language", "en");
  u.searchParams.set("safesearch", "1");
  const r = await fetch(u, { headers: { accept: "application/json", "user-agent": "BharatShop/1.0" } });
  if (!r.ok) throw new Error(`SearXNG ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.results) ? d.results.map(x => ({ url: x.img_src || x.thumbnail_src, sourceUrl: x.url || x.source_url, title: x.title, source: x.source })) : [];
}
async function main() {
  const client = await pool.connect();
  try {
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
        const u = String(x.url || "").trim();
        if (!/^https?:\/\//i.test(u) || PLACEHOLDER.test(u) || !x.sourceUrl) continue;
        const s = score(x, p);
        if (s <= 0) continue;
        if (!unique.has(u)) unique.set(u, { ...x, score: s });
      }
      const best = [...unique.values()].sort((a,b) => b.score-a.score).slice(0,8);
      if (best.length < 4) {
        console.log(JSON.stringify({ productId:p.id, status:"NO_EXACT_IMAGES", images:best.length, provider:"searxng" }));
        continue;
      }
      await client.query("BEGIN");
      await client.query(`DELETE FROM product_images WHERE product_id=$1 AND verification_status='WEB_IMAGE_EXACT_MATCH'`, [p.id]);
      for (let i=0;i<best.length;i++) {
        const x=best[i];
        const label = fashion && i===0 ? "Product view" : fashion && i<4 ? "Style / variant view" : i<4 ? "Product view" : "Packaging / included items";
        await client.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) VALUES ($1,$2,$3,$4,$5,'WEB_IMAGE_EXACT_MATCH')`, [p.id,x.url,x.sourceUrl,i,`${p.title} — ${label}`]);
      }
      await client.query(`UPDATE products SET image_url=$2,updated_at=NOW() WHERE id=$1`, [p.id,best[0].url]);
      await client.query("COMMIT");
      resolved++;
      console.log(JSON.stringify({ productId:p.id,status:"GALLERY_RESOLVED",images:best.length,fashion,provider:"searxng" }));
    }
    console.log(JSON.stringify({ status:"COMPLETED",provider:"searxng",processed:rows.length,resolved,batchSize:BATCH_SIZE }));
  } finally { client.release(); await pool.end(); }
}
main().catch(e=>{console.error(e);process.exit(1)});
