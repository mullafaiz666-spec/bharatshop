import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { asc, eq, ilike, or } from "drizzle-orm";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const MIN_IMAGES = 4;

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
async function serp(q:string){
  const key=process.env.SERPAPI_API_KEY;
  if(!key) throw new Error("SERPAPI_API_KEY is not configured");
  const r=await fetch(`https://serpapi.com/search.json?engine=google_shopping&google_domain=google.co.in&gl=in&hl=en&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`,{cache:"no-store"});
  if(!r.ok) throw new Error(`SerpAPI returned ${r.status}`);
  return r.json();
}

async function discoverToStaging(userId:number, limit=10){
  const queries=["best selling useful products India ecommerce","trending home gadgets India ecommerce","popular beauty personal care products India ecommerce"];
  const raw:any[]=[];
  for(const q of queries){
    const d=await serp(q);
    for(const x of d.shopping_results||[]) raw.push({title:x.title,brand:x.brand||"Generic",source:x.source||"",sourceUrl:x.link||x.product_link||"",price:x.extracted_price||0,thumbnail:x.thumbnail||""});
  }
  let staged=0;
  for(const item of raw.slice(0,Math.max(1,Math.min(10,limit)))){
    if(!item.title||!item.sourceUrl||!item.price) continue;
    const duplicate=await db.select({id:products.id}).from(products).where(ilike(products.title,`%${String(item.title).slice(0,80)}%`)).limit(1);
    if(duplicate.length) continue;
    const cost=Number(item.price); const shipping=60; const selling=Math.ceil((cost+shipping)/0.55/10)*10; const profit=selling-cost-shipping;
    const [p]=await db.insert(products).values({userId,storeId:null,sku:`SERP-STAGED-${Date.now()}-${staged}`,title:String(item.title),category:"AI Researched",imageUrl:String(item.thumbnail||item.sourceUrl),brand:String(item.brand||"Generic"),supplierName:String(item.source||"Research source"),supplierCity:"India",supplierCostInr:cost.toFixed(2),shippingCostInr:shipping.toFixed(2),gstPct:"18.00",sellingPriceInr:selling.toFixed(2),mrpInr:(selling*1.15).toFixed(2),customMarginPct:(profit/selling*100).toFixed(2),netProfitInr:profit.toFixed(2),aiScore:90,viralVelocityScore:80,stockCount:100,moq:1,autoRepriceEnabled:true,status:"STAGED",aiMarketingCopy:"",aiTargetAudience:"Online shoppers in India",hsnCode:"",salesCount24h:0,returnsCount:0}).returning();
    await db.insert(productImages).values({productId:p.id,imageUrl:String(item.thumbnail||item.sourceUrl),sourceUrl:String(item.sourceUrl),sortOrder:0,altText:String(p.title),verificationStatus:"UNVERIFIED"});
    await db.insert(aiActivityLogs).values({userId,agentName:"Product-Research-Agent",actionType:"PRODUCT_RESEARCH_STAGED",message:`SerpAPI discovery staged for central media verification: ${p.title}`,profitImpactInr:profit.toFixed(2),status:"SUCCESS",metadataJson:{productId:p.id,sourceUrl:item.sourceUrl,source:item.source,priceInr:cost}});
    staged++;
    if(staged>=1) break;
  }
  return staged;
}

async function enforcePublicationGate(){
  const all=await db.select().from(products).orderBy(asc(products.id));
  const imgs=await db.select().from(productImages);
  const counts=new Map<number,number>();
  for(const x of imgs) if(String(x.verificationStatus)==="AI_VISION_VERIFIED"&&!BAD.test(x.imageUrl)&&/^https?:\/\//i.test(x.imageUrl)) counts.set(x.productId,(counts.get(x.productId)||0)+1);
  const blocked=all.filter(p=>p.status==="Published"&&(counts.get(p.id)||0)<MIN_IMAGES);
  for(const p of blocked) await db.update(products).set({status:"STAGED",updatedAt:new Date()}).where(eq(products.id,p.id));
  return {blocked:blocked.length,verifiedPublished:all.filter(p=>p.status==="Published"&&(counts.get(p.id)||0)>=MIN_IMAGES).length};
}

export async function GET(){return NextResponse.json({agent:"Product-Research-and-Catalogue-Agent",automation:"catalog-maintenance",status:process.env.SERPAPI_API_KEY&&process.env.ANTHROPIC_API_KEY?"ready":"blocked_missing_keys",publicationPolicy:"STAGED until central Media Resolver proves >=4 AI_VISION_VERIFIED images"});}

export async function POST(req:Request){
  try{
    const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||req.headers.get("x-automation-token");
    if(!process.env.BHARATSHOP_AUTOMATION_TOKEN||token!==process.env.BHARATSHOP_AUTOMATION_TOKEN) return NextResponse.json({error:"Unauthorized"},{status:401});
    const body=await req.json().catch(()=>({})); const userId=Number(body.userId||1); const limit=Math.max(1,Math.min(10,Number(body.limit||2)));
    const gateBefore=await enforcePublicationGate();
    let staged=0;
    if(String(body.mode||"maintenance")==="research") staged=await discoverToStaging(userId,limit);
    const all=await db.select({id:products.id,status:products.status}).from(products).where(or(eq(products.status,"STAGED"),eq(products.status,"Published"))).orderBy(asc(products.id));
    const results=[];
    for(const p of all.slice(0,limit)){ results.push(await resolveVerifiedProductMedia(p.id)); await sleep(50); }
    const gateAfter=await enforcePublicationGate();
    return NextResponse.json({status:"COMPLETED",provider:"serpapi->postgres-staging->searxng->claude-vision",staged,processed:results.length,resolved:results.filter((r:any)=>r.status==="COMPLETE_MEDIA_RESOLVED").length,blocked:results.filter((r:any)=>r.publicationGate==="BLOCK").length,gateBefore,gateAfter,results,policy:"This route cannot publish directly. A product becomes Published only inside the central Media Resolver after 4-8 reachable AI_VISION_VERIFIED images."});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Catalog maintenance failed",publicationGate:"BLOCK"},{status:503});}
}
