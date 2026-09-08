import {NextResponse} from "next/server";
import {db} from "@/db";
import {products,productDetails} from "@/db/schema";
import {eq,or} from "drizzle-orm";
import {serpSearch,openAIJson} from "@/lib/ai/agent-tools";
const FASHION=/(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|lehenga|salwar|apparel|clothing|streetwear|hoodie|jogger|cargo|footwear|shoe|sandal)/i;

function auth(req:Request){const expected=process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN;const supplied=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||req.headers.get("x-automation-token")||"";return !!expected&&supplied===expected;}

export async function POST(req:Request){
 try{
  if(!auth(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!process.env.SEARXNG_URL||!(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL))return NextResponse.json({error:"SearXNG and local AI provider are required"},{status:503});
  const body=await req.json().catch(()=>({}));const limit=Math.max(1,Math.min(10,Number(body.limit||5)));
  const all=await db.select().from(products).where(or(eq(products.status,"STAGED"),eq(products.status,"CEO_PENDING"),eq(products.status,"Published")));
  const rows=all.filter(p=>FASHION.test(`${p.category} ${p.title}`)).slice(0,limit);let enriched=0;const results:any[]=[];
  for(const p of rows){
   try{
    const d=await serpSearch(`${p.title} ${p.brand} official size chart available sizes colours`,"google");
    const sources=(d.organic_results||[]).slice(0,8).map((x:any)=>({title:x.title,link:x.link,snippet:x.snippet,source:x.source}));
    if(!sources.length){results.push({productId:p.id,status:"NO_EVIDENCE"});continue;}
    const out=await openAIJson("You are BharatShop Fashion Enrichment Agent. Use ONLY supplied web evidence. Never invent sizes, measurements, colours, materials, variants, certifications or claims. Return JSON {availableSizes:string[],sizeChart:[{size:string,chestCm?:string,lengthCm?:string,waistCm?:string,hipCm?:string}],colors:string[],variants:string[],description:string,specifications:object}. Missing evidence must be empty arrays/strings.",{product:{title:p.title,brand:p.brand,category:p.category},sources});
    const sizes=Array.isArray(out.availableSizes)?out.availableSizes.map(String).filter(Boolean):[];const chart=Array.isArray(out.sizeChart)?out.sizeChart.filter((x:any)=>x?.size):[];const colors=Array.isArray(out.colors)?out.colors.map(String).filter(Boolean):[];const variants=Array.isArray(out.variants)?out.variants.map(String).filter(Boolean):[];
    const evidenceBacked=sizes.length||chart.length||colors.length||variants.length||String(out.description||"").trim()||Object.keys(out.specifications&&typeof out.specifications==="object"?out.specifications:{}).length;
    if(!evidenceBacked){results.push({productId:p.id,status:"NO_EXTRACTABLE_FACTS"});continue;}
    const [existing]=await db.select().from(productDetails).where(eq(productDetails.productId,p.id)).limit(1);
    const oldSpecs=existing?.specificationsJson&&typeof existing.specificationsJson==="object"&&!Array.isArray(existing.specificationsJson)?existing.specificationsJson as Record<string,unknown>:{};
    const specs={...oldSpecs,...(out.specifications&&typeof out.specifications==="object"?out.specifications:{}),availableSizes:sizes,sizeChart:chart,verifiedEnrichmentSources:sources.map((s:any)=>s.link),enrichmentProvider:"SearXNG+local-Gemma",enrichedAt:new Date().toISOString()};
    const values={description:String(out.description||existing?.description||""),specificationsJson:specs,variantsJson:variants.length?variants:(sizes.length?sizes:(existing?.variantsJson||[])),colorOptions:colors.length?colors.join(", "):(existing?.colorOptions||""),verificationStatus:existing?.verificationStatus||"ENRICHED",verifiedAt:existing?.verifiedAt||new Date(),updatedAt:new Date()};
    if(existing)await db.update(productDetails).set(values).where(eq(productDetails.productId,p.id));else await db.insert(productDetails).values({productId:p.id,...values,sourceUrl:""});
    enriched++;results.push({productId:p.id,status:"ENRICHED",sourceCount:sources.length,sizes:sizes.length,colors:colors.length});
   }catch(e){results.push({productId:p.id,status:"ERROR",error:e instanceof Error?e.message:"failed"});}
  }
  const errors=results.filter(x=>x.status==="ERROR").length;
  return NextResponse.json({status:errors?"PARTIAL":"COMPLETED",processed:rows.length,enriched,errors,results,provider:"SearXNG+local-Gemma",rule:"Only evidence-backed sizes, charts, colours and variants are persisted."},{status:errors?207:200});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Fashion enrichment failed"},{status:500})}
}
export async function GET(){return NextResponse.json({agent:"Fashion-Enrichment-Agent",status:process.env.SEARXNG_URL&&(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL)?"ready":"blocked_missing_provider",provider:"SearXNG+local-Gemma",paidProvidersRequired:false});}
export const dynamic = "force-dynamic";
