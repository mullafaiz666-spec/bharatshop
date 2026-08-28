import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free"]);
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)/i;
type ImageSearchResult = { original?: string; link?: string; title?: string; source?: string; };
function tokens(s:string){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>2&&!STOP.has(x));}
function score(item:ImageSearchResult,p:any){const ts=tokens(p.title);const hay=`${item.title||""} ${item.source||""} ${item.link||""}`.toLowerCase();const hits=ts.filter(t=>hay.includes(t)).length;const ratio=ts.length?hits/ts.length:0;const brand=String(p.brand||"").trim().toLowerCase();return ratio+(brand&&brand!=="generic"&&hay.includes(brand)?0.25:0);}
async function searchImages(q:string,key:string):Promise<ImageSearchResult[]>{const u=new URL("https://serpapi.com/search.json");u.searchParams.set("engine","google_images");u.searchParams.set("q",q);u.searchParams.set("hl","en");u.searchParams.set("gl","in");u.searchParams.set("api_key",key);const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(`SerpAPI ${r.status}`);const d=await r.json();return Array.isArray(d.images_results)?d.images_results as ImageSearchResult[]:[];}
export async function POST(req:Request){
 try{
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!process.env.BHARATSHOP_AUTOMATION_TOKEN||token!==process.env.BHARATSHOP_AUTOMATION_TOKEN)return NextResponse.json({error:"Unauthorized"},{status:401});
  const key=process.env.SERPAPI_API_KEY;if(!key)return NextResponse.json({error:"SERPAPI_API_KEY is not configured"},{status:503});
  const body=await req.json().catch(()=>({}));const limit=Math.max(1,Math.min(20,Number(body.limit||10)));
  const all=await db.select().from(products).where(eq(products.status,"Published")).orderBy(asc(products.id));
  const imgs=await db.select().from(productImages);const exact=new Set(imgs.filter(x=>x.verificationStatus==="WEB_IMAGE_EXACT_MATCH"&&!BAD.test(x.imageUrl)).map(x=>x.productId));
  const candidates=all.filter(p=>!exact.has(p.id)).slice(0,limit);let resolved=0,rejected=0;const results: Array<Record<string, unknown>>=[];
  for(const p of candidates){const fashion=FASHION.test(`${p.category} ${p.title}`);const q=`${p.title} ${p.brand!=="Generic"?p.brand:""} exact product official supplier image`;let found:ImageSearchResult[]=[];try{found=await searchImages(q,key);}catch(e){results.push({productId:p.id,status:"SEARCH_ERROR",error:e instanceof Error?e.message:"search failed"});continue;}
   const ranked=found.filter((x:ImageSearchResult)=>x.original&&/^https?:\/\//i.test(x.original)&&x.link&&!BAD.test(x.original)).map((x:ImageSearchResult)=>({...x,score:score(x,p)})).sort((a,b)=>b.score-a.score);const best=ranked[0];const threshold=fashion?0.70:0.45;
   if(!best||best.score<threshold){rejected++;results.push({productId:p.id,status:"NO_EXACT_IMAGE",score:Number((best?.score||0).toFixed(3)),fashion});continue;}
   await db.delete(productImages).where(eq(productImages.productId,p.id));
   await db.insert(productImages).values({productId:p.id,imageUrl:best.original!,sourceUrl:best.link!,sortOrder:0,altText:best.title||p.title,verificationStatus:"WEB_IMAGE_EXACT_MATCH"});
   await db.update(products).set({imageUrl:best.original!,updatedAt:new Date()}).where(eq(products.id,p.id));
   resolved++;results.push({productId:p.id,status:"EXACT_IMAGE_RESOLVED",score:Number(best.score.toFixed(3)),fashion,source:best.link});
  }
  return NextResponse.json({status:"COMPLETED",processed:candidates.length,resolved,rejected,results});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Image resolver failed"},{status:500});}
}
