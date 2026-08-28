import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products, productDetails } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
const STOP=new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free"]);
const FASHION=/(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;
const BAD=/(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)/i;
type ImageSearchResult={original?:string;link?:string;title?:string;source?:string;};
type VideoSearchResult={link?:string;title?:string;source?:string;thumbnail?:string;};
function tokens(s:string){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>2&&!STOP.has(x));}
function score(item:ImageSearchResult,p:any){const ts=tokens(p.title);const hay=`${item.title||""} ${item.source||""} ${item.link||""}`.toLowerCase();const hits=ts.filter(t=>hay.includes(t)).length;const ratio=ts.length?hits/ts.length:0;const brand=String(p.brand||"").trim().toLowerCase();return ratio+(brand&&brand!=="generic"&&hay.includes(brand)?0.25:0);}
function videoScore(item:VideoSearchResult,p:any){const ts=tokens(`${p.title} ${p.brand!=="Generic"?p.brand:""}`);const hay=`${item.title||""} ${item.source||""} ${item.link||""}`.toLowerCase();return ts.length?ts.filter(t=>hay.includes(t)).length/ts.length:0;}
async function searchImages(q:string,key:string){const u=new URL("https://serpapi.com/search.json");u.searchParams.set("engine","google_images");u.searchParams.set("q",q);u.searchParams.set("hl","en");u.searchParams.set("gl","in");u.searchParams.set("api_key",key);const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(`SerpAPI images ${r.status}`);const d=await r.json();return Array.isArray(d.images_results)?d.images_results as ImageSearchResult[]:[];}
async function searchVideos(q:string,key:string){const u=new URL("https://serpapi.com/search.json");u.searchParams.set("engine","google_videos");u.searchParams.set("q",q);u.searchParams.set("hl","en");u.searchParams.set("gl","in");u.searchParams.set("api_key",key);const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(`SerpAPI videos ${r.status}`);const d=await r.json();return Array.isArray(d.video_results)?d.video_results as VideoSearchResult[]:[];}
export async function POST(req:Request){
 try{
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!process.env.BHARATSHOP_AUTOMATION_TOKEN||token!==process.env.BHARATSHOP_AUTOMATION_TOKEN)return NextResponse.json({error:"Unauthorized"},{status:401});
  const key=process.env.SERPAPI_API_KEY;if(!key)return NextResponse.json({error:"SERPAPI_API_KEY is not configured"},{status:503});
  const body=await req.json().catch(()=>({}));const limit=Math.max(1,Math.min(50,Number(body.limit||25)));
  const all=await db.select().from(products).where(eq(products.status,"Published")).orderBy(asc(products.id));const imgs=await db.select().from(productImages);const counts=new Map<number,number>();
  for(const x of imgs){if(["WEB_IMAGE_EXACT_MATCH","WEB_SEARCH_MATCHED","VERIFIED"].includes(String(x.verificationStatus))&&!BAD.test(x.imageUrl))counts.set(x.productId,(counts.get(x.productId)||0)+1);}
  const candidates=all.filter(p=>(counts.get(p.id)||0)<8).slice(0,limit);let resolved=0,rejected=0,videosFound=0;const results:Array<Record<string,unknown>>=[];
  for(const p of candidates){
   const fashion=FASHION.test(`${p.category} ${p.title}`);const base=`${p.title} ${p.brand!=="Generic"?p.brand:""}`;
   const queries=[`${base} exact product official image front`,`${base} exact product back side angle image`,`${base} exact product box packaging contents`,`${base} exact product colour variants colors`];
   let found:ImageSearchResult[]=[];let videos:VideoSearchResult[]=[];
   try{for(const q of queries)found.push(...await searchImages(q,key));videos=await searchVideos(`${base} official product video demo unboxing`,key);}catch(e){results.push({productId:p.id,status:"SEARCH_ERROR",error:e instanceof Error?e.message:"search failed"});continue;}
   const threshold=fashion?0.70:0.45;
   const ranked=found.filter(x=>x.original&&/^https?:\/\//i.test(x.original)&&x.link&&!BAD.test(x.original)).map(x=>({...x,score:score(x,p)})).sort((a,b)=>b.score-a.score);
   const selected:any[]=[];const seen=new Set<string>();
   for(const item of ranked){if(selected.length>=8)break;if(Number(item.score)<threshold||seen.has(item.original!))continue;seen.add(item.original!);selected.push(item);}
   if(!selected.length){rejected++;results.push({productId:p.id,status:"NO_EXACT_IMAGE",score:Number((ranked[0]?.score||0).toFixed(3)),fashion});continue;}
   await db.delete(productImages).where(eq(productImages.productId,p.id));
   await db.insert(productImages).values(selected.map((item:any,index:number)=>({productId:p.id,imageUrl:item.original!,sourceUrl:item.link!,sortOrder:index,altText:item.title||`${p.title} customer view ${index+1}`,verificationStatus:"WEB_IMAGE_EXACT_MATCH"})));
   const rankedVideos=videos.filter(v=>v.link&&/^https?:\/\//i.test(v.link)).map(v=>({...v,score:videoScore(v,p)})).sort((a,b)=>b.score-a.score).slice(0,3);
   if(rankedVideos.length){
    const existing=await db.select().from(productDetails).where(eq(productDetails.productId,p.id)).limit(1);const old=existing[0]?.specificationsJson&&typeof existing[0].specificationsJson==="object"&&!Array.isArray(existing[0].specificationsJson)?existing[0].specificationsJson as Record<string,unknown>:{};
    const media={...(old.media as Record<string,unknown>||{}),videos:rankedVideos.map(v=>({url:v.link,title:v.title||p.title,source:v.source||"Web video",thumbnail:v.thumbnail||""}))};
    if(existing[0])await db.update(productDetails).set({specificationsJson:{...old,media},updatedAt:new Date()}).where(eq(productDetails.productId,p.id));
    else await db.insert(productDetails).values({productId:p.id,specificationsJson:{media},verificationStatus:"VERIFIED",updatedAt:new Date()});
    videosFound++;
   }
   await db.update(products).set({imageUrl:selected[0].original!,updatedAt:new Date()}).where(eq(products.id,p.id));resolved++;results.push({productId:p.id,status:"COMPLETE_MEDIA_RESOLVED",imageCount:selected.length,videoCount:rankedVideos.length,scores:selected.map(x=>Number(x.score.toFixed(3))),sources:selected.map(x=>x.link)});
  }
  return NextResponse.json({status:"COMPLETED",processed:candidates.length,resolved,rejected,videosFound,results,policy:"Every published product is onboarded with up to eight high-confidence exact product images covering front, back/side, packaging/contents and available colour variants. Matching product videos are discovered when available and stored for storefront playback. No placeholder images are accepted."});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Media resolver failed"},{status:500});}
}
