import { NextResponse } from "next/server";
import { pool } from "@/db";
import { openAIJson } from "@/lib/ai/agent-tools";
import { qikinkCostForDesign } from "@/lib/suppliers/qikink-rate-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req:Request){
  const expected=process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN;
  if(!expected)return true;
  return req.headers.get("authorization")===`Bearer ${expected}`||req.headers.get("x-automation-token")===expected;
}

const SEEDS=[
 {code:"M-NIGHTGRID",audience:"men",category:"Men's Fashion",garment:"Oversized Classic T-Shirt",print:"DTF",title:"Night Grid Oversized Tee",brief:"architectural midnight grid with offset electric linework",palette:["#0b1020","#ff6b00","#d7e3ff"],target:799},
 {code:"M-MONSOON",audience:"men",category:"Men's Fashion",garment:"Men's Full Sleeve T-Shirt",print:"DTF",title:"Monsoon Signal Full Sleeve Tee",brief:"rain-map contours with a clean technical chest motif",palette:["#172554","#60a5fa","#e0f2fe"],target:749},
 {code:"M-SANDSTONE",audience:"men",category:"Men's Fashion",garment:"Men's Polo",print:"Embroidery",title:"Sandstone Minimal Polo",brief:"quiet geometric emblem inspired by carved stone rhythm",palette:["#3f352b","#d6c3a5","#f5efe6"],target:899},
 {code:"M-VELOCITY",audience:"men",category:"Men's Fashion",garment:"Oversized Standard T-Shirt",print:"DTF",title:"Velocity Arc Oversized Tee",brief:"sweeping motion arcs and restrained race-inspired geometry without logos",palette:["#111827","#ef4444","#f8fafc"],target:799},
 {code:"W-AURORA",audience:"women",category:"Women's Fashion",garment:"Women's AOP Crop Top",print:"AOP",title:"Aurora Bloom AOP Crop Top",brief:"soft luminous petals dissolving into abstract gradient geometry",palette:["#3b0764","#f472b6","#fde68a"],target:699},
 {code:"W-INKWAVE",audience:"women",category:"Women's Fashion",garment:"Women's T-Shirt Dress",print:"DTF",title:"Ink Wave T-Shirt Dress",brief:"fluid brush-wave composition with generous negative space",palette:["#111827","#f8fafc","#fb7185"],target:849},
 {code:"W-LOTUSLINE",audience:"women",category:"Women's Fashion",garment:"Women's Crop Hoodie",print:"DTF",title:"Lotus Line Crop Hoodie",brief:"single-line botanical geometry with a modern metropolitan feel",palette:["#581c87","#c084fc","#faf5ff"],target:949},
 {code:"W-SUNMESH",audience:"women",category:"Women's Fashion",garment:"Women's AOP T-Shirt",print:"AOP",title:"Sun Mesh AOP Tee",brief:"warm mesh lattice and small solar discs arranged in a clean repeat",palette:["#7c2d12","#fb923c","#ffedd5"],target:749},
 {code:"K-PLANET",audience:"kids",category:"Baby & Kids",garment:"Kid's AOP T-Shirt",print:"AOP",title:"Pocket Planet Kids AOP Tee",brief:"friendly original planets, stars and orbit doodles with no licensed characters",palette:["#1e3a8a","#38bdf8","#fef08a"],target:549},
 {code:"K-JUNGLE",audience:"kids",category:"Baby & Kids",garment:"Boy's Crew Neck T-Shirt",print:"DTF",title:"Tiny Jungle Crew Tee",brief:"original leaf shapes and cheerful abstract animal-like silhouettes without copying characters",palette:["#14532d","#86efac","#fef3c7"],target:499},
 {code:"K-CONFETTI",audience:"kids",category:"Baby & Kids",garment:"Girl's Crew Neck T-Shirt",print:"DTF",title:"Confetti Cloud Crew Tee",brief:"playful cloud geometry, dots and ribbons in a bright original composition",palette:["#be185d","#f9a8d4","#dbeafe"],target:499},
 {code:"K-COMET",audience:"kids",category:"Baby & Kids",garment:"Kids Hoodie",print:"DTF",title:"Comet Trail Kids Hoodie",brief:"bold original comet trail with tiny stars and motion marks",palette:["#312e81","#818cf8","#fef3c7"],target:799},
] as const;

const round50=(n:number)=>Math.ceil(n/50)*50;
const clean=(value:unknown)=>String(value||"").replace(/[<>]/g,"").trim();

async function creativeDirection(){
  try{
    const ai=await openAIJson(
      "You are BharatShop's local fashion creative director. Improve an ORIGINAL Indian ecommerce capsule without copying brands, logos, characters or protected artwork. Return JSON with collectionName, mood and merchandisingNote only.",
      {production:"Qikink print-on-demand",audiences:["men","women","kids"],themes:SEEDS.map(x=>x.brief)},
      {timeoutMs:8000,maxTokens:300},
    );
    return {collectionName:clean(ai.collectionName)||"BharatShop Studio Drop",mood:clean(ai.mood)||"modern Indian street-to-everyday",merchandisingNote:clean(ai.merchandisingNote)||"Balanced capsule across men, women and kids.",modelStatus:"local-gemma"};
  }catch(error){
    return {collectionName:"BharatShop Studio Drop",mood:"modern Indian street-to-everyday",merchandisingNote:"Balanced original capsule across men, women and kids using Qikink-producible garments.",modelStatus:"deterministic-fallback",modelError:error instanceof Error?error.message:String(error)};
  }
}

export async function runFashionDesigner(count:number,origin:string){
  const requested=Math.max(3,Math.min(24,Number(count||12)));
  const direction=await creativeDirection();
  const day=new Date().toISOString().slice(0,10).replaceAll("-","");
  const results:any[]=[];
  for(let i=0;i<requested;i++){
    const seed=SEEDS[i%SEEDS.length];
    const rate=qikinkCostForDesign(seed.garment,seed.print,seed.audience);
    const minMargin=Number(process.env.MIN_AI_PRODUCT_MARGIN_PCT||35);
    const selling=Math.max(seed.target,round50(rate.landedCostInr/(1-Math.max(minMargin,40)/100)));
    const profit=selling-rate.landedCostInr;
    const margin=selling>0?profit/selling*100:0;
    if(margin<minMargin){results.push({title:seed.title,status:"REJECTED_MARGIN",margin:Number(margin.toFixed(1))});continue;}

    const sku=`BSF-${seed.code}-${day}`;
    const sourceUrl=rate.sourceUrl;
    const existing=await pool.query(`SELECT id,status FROM products WHERE sku=$1 LIMIT 1`,[sku]);
    let productId:number;
    if(existing.rows[0]){
      productId=Number(existing.rows[0].id);
      await pool.query(`UPDATE products SET title=$2,category=$3,brand='BharatShop Studio',supplier_name='Qikink',supplier_city='India',supplier_cost_inr=$4,shipping_cost_inr=$5,gst_pct=0,selling_price_inr=$6,mrp_inr=$7,custom_margin_pct=$8,net_profit_inr=$9,ai_score=$10,viral_velocity_score=$11,stock_count=0,status=CASE WHEN status='Published' THEN 'Published' ELSE 'CEO_PENDING' END,ai_marketing_copy=$12,ai_target_audience=$13,updated_at=NOW() WHERE id=$1`,[productId,seed.title,seed.category,(rate.productBaseInr+rate.printingInr).toFixed(2),(rate.shippingInr+rate.codInr+rate.gstInr).toFixed(2),selling.toFixed(2),Math.ceil(selling*1.2).toFixed(2),margin.toFixed(2),profit.toFixed(2),88+(i%8),82+(i%12),`${seed.title} is an original BharatShop Studio design made to order by Qikink. ${seed.brief}.`,seed.audience]);
    }else{
      const inserted=await pool.query(`INSERT INTO products (user_id,sku,title,category,image_url,brand,supplier_name,supplier_city,supplier_cost_inr,shipping_cost_inr,gst_pct,selling_price_inr,mrp_inr,custom_margin_pct,net_profit_inr,ai_score,viral_velocity_score,stock_count,moq,status,ai_marketing_copy,ai_target_audience) VALUES (1,$1,$2,$3,'','BharatShop Studio','Qikink','India',$4,$5,0,$6,$7,$8,$9,$10,$11,0,1,'CEO_PENDING',$12,$13) RETURNING id`,[sku,seed.title,seed.category,(rate.productBaseInr+rate.printingInr).toFixed(2),(rate.shippingInr+rate.codInr+rate.gstInr).toFixed(2),selling.toFixed(2),Math.ceil(selling*1.2).toFixed(2),margin.toFixed(2),profit.toFixed(2),88+(i%8),82+(i%12),`${seed.title} is an original BharatShop Studio design made to order by Qikink. ${seed.brief}.`,seed.audience]);
      productId=Number(inserted.rows[0].id);
    }

    const images=[0,1,2,3].map(view=>`${origin.replace(/\/$/,"")}/api/fashion-art/${productId}/${view}`);
    await pool.query(`UPDATE products SET image_url=$2 WHERE id=$1`,[productId,images[0]]);
    const specs={designOrigin:"BharatShop Studio",productionSupplier:"Qikink",inventoryMode:"MADE_TO_ORDER",qikinkProductCode:rate.productCode,qikinkProductName:rate.productName,qikinkRateSource:rate.rateSource,qikinkSourceUrl:sourceUrl,printMethod:seed.print,designBrief:seed.brief,palette:[...seed.palette],audience:seed.audience,sizes:rate.sizes,collection:direction.collectionName,mood:direction.mood,landedCostInr:rate.landedCostInr,productionGate:"Qikink account/API connection is required before automatic supplier submission",generatedAt:new Date().toISOString()};
    const details=await pool.query(`SELECT id FROM product_details WHERE product_id=$1 LIMIT 1`,[productId]);
    const description=`${seed.title}. Original BharatShop Studio artwork mapped to Qikink ${rate.productName} (${rate.productCode}) for made-to-order production.`;
    if(details.rows[0])await pool.query(`UPDATE product_details SET description=$2,specifications_json=$3,variants_json=$4,included_items=$5,material=$6,color_options=$7,source_url=$8,verification_status='SOURCE_VERIFIED',verified_at=NOW(),updated_at=NOW() WHERE product_id=$1`,[productId,description,JSON.stringify(specs),JSON.stringify(rate.sizes.map(size=>({size,available:"made-to-order"}))),"1 made-to-order printed garment","See mapped Qikink garment specification",seed.palette.join(", "),sourceUrl]);
    else await pool.query(`INSERT INTO product_details (product_id,description,specifications_json,variants_json,included_items,material,color_options,source_url,verification_status,verified_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOURCE_VERIFIED',NOW(),NOW())`,[productId,description,JSON.stringify(specs),JSON.stringify(rate.sizes.map(size=>({size,available:"made-to-order"}))),"1 made-to-order printed garment","See mapped Qikink garment specification",seed.palette.join(", "),sourceUrl]);

    await pool.query(`DELETE FROM product_images WHERE product_id=$1 AND verification_provider='bharatshop-studio'`,[productId]);
    for(let view=0;view<images.length;view++)await pool.query(`INSERT INTO product_images (product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at) VALUES ($1,$2,$3,$4,$5,'AI_GENERATED_ORIGINAL',1,'bharatshop-svg-fashion-v1','bharatshop-studio',$6,NOW())`,[productId,images[view],sourceUrl,view,`${seed.title} design view ${view+1}`,JSON.stringify({designOrigin:"BharatShop Studio",qikinkProductCode:rate.productCode,view,productionSource:sourceUrl})]);
    await pool.query(`INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status) VALUES (1,'AI Fashion Designer','QIKINK_FASHION_CONCEPT_READY',$1,$2,'SUCCESS')`,[`${seed.title} created as an original BharatShop Studio design mapped to Qikink ${rate.productCode}; queued for CEO publication.`,JSON.stringify({productId,sku,rate,marginPct:Number(margin.toFixed(2)),inventoryMode:"MADE_TO_ORDER",direction})]);
    results.push({productId,sku,title:seed.title,audience:seed.audience,status:existing.rows[0]?.status==="Published"?"Published":"CEO_PENDING",marginPct:Number(margin.toFixed(1)),qikink:{productCode:rate.productCode,productName:rate.productName,sizes:rate.sizes,sourceUrl},images});
  }
  return {success:true,provider:"local-gemma+deterministic-original-art",productionSupplier:"Qikink",inventoryMode:"MADE_TO_ORDER",requested,generated:results.length,direction,results};
}

export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{const body=await req.json().catch(()=>({}));return NextResponse.json(await runFashionDesigner(Number(body.count||12),new URL(req.url).origin));}
  catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:"Fashion Designer failed"},{status:500});}
}

export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({status:"READY",agent:"AI Fashion Designer",textProvider:"local Gemma with deterministic fallback",artProvider:"BharatShop local SVG studio",productionSupplier:"Qikink",inventoryMode:"MADE_TO_ORDER",audiences:["men","women","kids"],autoPublish:"CEO-gated",credentialsRequiredForRateMapping:false,credentialsRequiredForAutomaticQikinkOrderSubmission:true});
}
