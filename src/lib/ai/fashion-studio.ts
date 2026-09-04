import { pool } from "@/db";
import { planAutomaticImageStyle } from "@/lib/ai/image-style-engine";

export type FashionCommand = {
  command: string;
  name: string;
  category: string;
  description: string;
  requiresProduct: boolean;
  defaultCount: number;
  prompt: string;
};

export const FASHION_COMMANDS: FashionCommand[] = [
  {command:"/autoimage",name:"Automatic Image",category:"AI Image Automation",description:"Automatically choose the best visual style for any product",requiresProduct:true,defaultCount:2,prompt:"AUTO_STYLE"},
  {command:"/productmodel",name:"Product & Model",category:"Product & Model Photography",description:"Put clothing on a realistic model",requiresProduct:true,defaultCount:2,prompt:"Create realistic ecommerce fashion model photography using the supplied garment. Preserve the garment's exact design, silhouette, fabric, colors, prints, trims and construction. Show a natural full-body model pose with clean commercial lighting."},
  {command:"/catalogmodel",name:"Catalog Model",category:"Product & Model Photography",description:"Create clean professional catalog visuals",requiresProduct:true,defaultCount:2,prompt:"Create premium clean ecommerce catalog photography using the supplied garment. Preserve the exact product identity and details. Neutral studio background, accurate proportions, front-facing commercial composition, crisp textile detail."},
  {command:"/outfitpreview",name:"Outfit Preview",category:"Product & Model Photography",description:"Preview clothing on different models",requiresProduct:true,defaultCount:3,prompt:"Create realistic outfit-preview photography for the supplied garment on diverse adult fashion models. Preserve the exact garment. Use distinct natural poses and body types while keeping the clothing consistent."},
  {command:"/studiomodel",name:"Studio Model",category:"Product & Model Photography",description:"Create a premium studio photoshoot",requiresProduct:true,defaultCount:3,prompt:"Create a high-end professional studio fashion photoshoot featuring the supplied garment. Preserve exact garment details. Premium controlled lighting, realistic skin and textile texture, editorial-quality but commercially usable."},
  {command:"/outfitstyling",name:"Outfit Styling",category:"Styling & Collection",description:"Turn one clothing piece into a complete styled outfit",requiresProduct:true,defaultCount:3,prompt:"Build complete stylish outfits around the supplied hero garment. Keep the hero garment exact and clearly visible. Add tasteful complementary accessories and footwear without obscuring the product."},
  {command:"/colorway",name:"Colorway",category:"Styling & Collection",description:"Generate multiple color variations",requiresProduct:true,defaultCount:4,prompt:"Generate distinct commercially plausible colorway variations of the supplied garment. Preserve its exact construction, print placement and texture while changing only the primary color palette. Present each variation clearly."},
  {command:"/lookbook",name:"Lookbook",category:"Styling & Collection",description:"Create a professional collection lookbook",requiresProduct:true,defaultCount:4,prompt:"Create an elegant fashion lookbook image using the supplied garment as the hero product. Premium art direction, cohesive composition, sophisticated editorial styling, commercially realistic and product-faithful."},
  {command:"/seasoncollection",name:"Season Collection",category:"Styling & Collection",description:"Create seasonal campaign visuals",requiresProduct:true,defaultCount:3,prompt:"Create a seasonal fashion campaign visual featuring the supplied garment. Use season-appropriate environment and styling while preserving the garment's exact identity, color, pattern and construction."},
  {command:"/windowdisplay",name:"Window Display",category:"Retail & Store Visuals",description:"Design an attractive retail window display",requiresProduct:true,defaultCount:2,prompt:"Design a premium fashion retail window display showcasing the supplied garment prominently. Sophisticated merchandising, realistic mannequins or models, attractive lighting and a polished Indian fashion retail aesthetic."},
  {command:"/mannequininstore",name:"Mannequin In Store",category:"Retail & Store Visuals",description:"Showcase outfits on mannequins in a store",requiresProduct:true,defaultCount:2,prompt:"Create a photorealistic modern fashion store interior with the supplied garment accurately displayed on mannequins. Premium merchandising and realistic retail lighting. Keep the garment exact."},
  {command:"/storefront",name:"Storefront",category:"Retail & Store Visuals",description:"Create an appealing storefront design",requiresProduct:true,defaultCount:2,prompt:"Create an aspirational fashion brand storefront exterior featuring the supplied garment in the visual merchandising. Premium Indian retail design, realistic architecture, signage space, inviting lighting and polished presentation."},
  {command:"/storeinterior",name:"Store Interior",category:"Retail & Store Visuals",description:"Design a modern aesthetic clothing store interior",requiresProduct:true,defaultCount:2,prompt:"Create a modern aesthetic fashion store interior where the supplied garment is featured naturally. Premium fixtures, realistic lighting, elegant merchandising, spacious commercial design and exact product preservation."},
  {command:"/fashioncampaign",name:"Fashion Campaign",category:"Marketing & Campaigns",description:"Create high-impact campaign visuals",requiresProduct:true,defaultCount:3,prompt:"Create a high-impact fashion advertising campaign image centered on the supplied garment. Bold art direction, premium photography, strong composition and realistic product details. Leave clean negative space for copy."},
  {command:"/collectionlaunch",name:"Collection Launch",category:"Marketing & Campaigns",description:"Announce a new collection",requiresProduct:true,defaultCount:2,prompt:"Create a stunning new fashion collection launch hero visual using the supplied garment. Premium campaign photography, aspirational styling, dramatic but realistic lighting, strong visual hierarchy and copy-safe negative space."},
  {command:"/fashionposter",name:"Fashion Poster",category:"Marketing & Campaigns",description:"Design an eye-catching fashion poster",requiresProduct:true,defaultCount:2,prompt:"Create a premium fashion promotional poster featuring the supplied garment. Strong editorial composition, realistic product, elegant typography-safe areas and a polished advertising aesthetic. Do not invent brand logos or text."},
  {command:"/salecreative",name:"Sale Creative",category:"Marketing & Campaigns",description:"Create sale ads, banners and social creatives",requiresProduct:true,defaultCount:2,prompt:"Create a high-converting fashion sale advertising creative featuring the supplied garment. Energetic but premium composition, product clearly visible, strong negative space for sale price and CTA, no fabricated logos or text."},
  {command:"/bridalwear",name:"Bridalwear",category:"Premium & Special Occasions",description:"Create luxurious bridal wear visuals",requiresProduct:true,defaultCount:3,prompt:"Create luxurious bridal fashion photography using the supplied garment. Rich but realistic details, refined Indian bridal styling, premium lighting and elegant environment. Preserve the garment exactly."},
  {command:"/occasionwear",name:"Occasionwear",category:"Premium & Special Occasions",description:"Create elegant party and event outfit visuals",requiresProduct:true,defaultCount:3,prompt:"Create elegant premium occasionwear photography featuring the supplied garment at a sophisticated event. Preserve exact garment details, realistic styling, flattering lighting and polished fashion photography."},
  {command:"/fashioneditorial",name:"Fashion Editorial",category:"Premium & Special Occasions",description:"Create high-end editorial fashion photography",requiresProduct:true,defaultCount:3,prompt:"Create high-end editorial fashion photography featuring the supplied garment. Artistic but photorealistic direction, sophisticated composition, premium lighting and exact preservation of the garment's identity."},
  {command:"/fashionbillboard",name:"Fashion Billboard",category:"Premium & Special Occasions",description:"Create impactful billboard advertising",requiresProduct:true,defaultCount:2,prompt:"Create a striking fashion billboard advertisement featuring the supplied garment. Large-format advertising composition, product clearly recognizable, bold visual impact, strong copy-safe negative space and photorealistic quality. Do not invent logos or text."}
];

export function getFashionCommand(command: string) {
  const normalized = String(command || "").trim().toLowerCase();
  return FASHION_COMMANDS.find(x => x.command === normalized);
}

async function getProduct(productId?: number, productName?: string) {
  if (productId) {
    const r = await pool.query(`SELECT id,title,brand,category,image_url FROM products WHERE id=$1 LIMIT 1`, [productId]);
    return r.rows[0] || null;
  }
  if (productName) {
    const r = await pool.query(`SELECT id,title,brand,category,image_url FROM products WHERE title ILIKE $1 ORDER BY id LIMIT 1`, [`%${productName}%`]);
    return r.rows[0] || null;
  }
  return null;
}

async function sourceImage(productId: number, fallback: string) {
  const r = await pool.query(`SELECT image_url FROM product_images WHERE product_id=$1 ORDER BY sort_order LIMIT 1`, [productId]);
  return r.rows[0]?.image_url || fallback;
}

async function openAIImage(prompt: string, source?: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  if (source && /^https?:\/\//i.test(source)) {
    try {
      const r = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        const type = r.headers.get("content-type") || "image/jpeg";
        const bytes = await r.arrayBuffer();
        form.append("image", new Blob([bytes], { type }), "product-reference.jpg");
      }
    } catch {}
  }
  const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(90000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Image provider ${r.status}: ${text.slice(0,500)}`);
  const data = JSON.parse(text);
  const item = data?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error("Image provider returned no image");
}

async function logActivity(productId: number | null, command: FashionCommand, status: string, metadata: any) {
  try {
    await pool.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'Image & Media',$1,$2,$3,$4)`, [`FASHION_${command.command.slice(1).toUpperCase()}`, `${command.command} ${status.toLowerCase()}${productId ? ` for product ${productId}` : ""}`, JSON.stringify({ command: command.command, productId, ...metadata }), status]);
  } catch {}
}

export async function runFashionCommand(input: { command: string; productId?: number; productName?: string; count?: number; extraPrompt?: string }) {
  const requested = String(input.command || "/autoimage").trim().toLowerCase();
  const product = await getProduct(input.productId, input.productName);
  if (requested === "/autoimage" || requested === "auto" || requested === "automatic") {
    if (!product) return { success: false, error: "/autoimage requires a productId or productName" };
    const plan = planAutomaticImageStyle({ title: product.title, brand: product.brand, category: product.category });
    const count = Math.max(1, Math.min(4, Number(input.count || 2)));
    const source = await sourceImage(product.id, product.image_url);
    const generated: string[] = [];
    const command: FashionCommand = { command: "/autoimage", name: "Automatic Image", category: "AI Image Automation", description: "Automatically choose the best visual style for any product", requiresProduct: true, defaultCount: 2, prompt: plan.prompt };
    for (let i = 0; i < count; i++) {
      const prompt = `${plan.prompt}\nVariation ${i + 1} of ${count}. ${input.extraPrompt || ""}\nProduct: ${product.title}; brand ${product.brand}; category ${product.category}`;
      try { generated.push(await openAIImage(prompt, source)); }
      catch (e) { await logActivity(product.id, command, "FAILED", { error: e instanceof Error ? e.message : "generation failed", generated: generated.length, plan }); break; }
    }
    if (!generated.length) return { success: false, command: "/autoimage", error: "No images generated", plan };
    const start = Number((await pool.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM product_images WHERE product_id=$1`, [product.id])).rows[0]?.n || 0);
    await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) SELECT $1,x,'AI_GENERATED',$2 + ord-1,$3 || ' variation ' || ord,'AI_GENERATED' FROM unnest($4::text[]) WITH ORDINALITY AS t(x,ord)`, [product.id, start, plan.productType, generated]);
    await pool.query(`UPDATE products SET image_url=$1,updated_at=NOW() WHERE id=$2`, [generated[0], product.id]);
    await logActivity(product.id, command, "SUCCESS", { generated: generated.length, count, persisted: true, plan });
    return { success: true, command: "/autoimage", name: "Automatic Image", productId: product.id, generated: generated.length, images: generated, persisted: true, provider: "openai-images", plan };
  }

  const command = getFashionCommand(requested);
  if (!command) return { success: false, error: `Unknown fashion command: ${input.command}`, commands: FASHION_COMMANDS.map(x => x.command) };
  if (command.requiresProduct && !product) return { success: false, error: `${command.command} requires a productId or productName` };
  const count = Math.max(1, Math.min(4, Number(input.count || command.defaultCount)));
  const source = product ? await sourceImage(product.id, product.image_url) : undefined;
  const generated: string[] = [];
  for (let i = 0; i < count; i++) {
    const prompt = `${command.prompt}\nVariation ${i + 1} of ${count}. ${input.extraPrompt || ""}\nProduct: ${product ? `${product.title}; brand ${product.brand}; category ${product.category}` : "fashion brand campaign"}`;
    try { generated.push(await openAIImage(prompt, source)); }
    catch (e) { await logActivity(product?.id ?? null, command, "FAILED", { error: e instanceof Error ? e.message : "generation failed", generated: generated.length }); break; }
  }
  if (!generated.length) return { success: false, command: command.command, error: "No images generated" };
  if (product) {
    const start = Number((await pool.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM product_images WHERE product_id=$1`, [product.id])).rows[0]?.n || 0);
    await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status) SELECT $1,x,'AI_GENERATED',$2 + ord-1,$3 || ' variation ' || ord,'AI_GENERATED' FROM unnest($4::text[]) WITH ORDINALITY AS t(x,ord)`, [product.id, start, command.name, generated]);
    await pool.query(`UPDATE products SET image_url=$1,updated_at=NOW() WHERE id=$2`, [generated[0], product.id]);
  }
  await logActivity(product?.id ?? null, command, "SUCCESS", { generated: generated.length, count, persisted: !!product });
  return { success: true, command: command.command, name: command.name, productId: product?.id ?? null, generated: generated.length, images: generated, persisted: !!product, provider: "openai-images" };
}
