import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { asc, eq, gt, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BAD_IMAGE_HOSTS = ["unsplash.com","images.unsplash.com","source.unsplash.com","placeholder.com","placehold.co","placehold.it","dummyimage.com","picsum.photos","loremflickr.com"];
function usable(url: unknown) { if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false; const lower=url.toLowerCase(); return !BAD_IMAGE_HOSTS.some(host=>lower.includes(host)); }
async function serpImageSearch(title:string,brand:string){
  const key=process.env.SERPAPI_API_KEY; if(!key) throw new Error("SERPAPI_API_KEY is not configured");
  const q=`${brand} ${title}`.trim(); const url=`https://serpapi.com/search.json?engine=google_images&google_domain=google.co.in&gl=in&hl=en&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`;
  const response=await fetch(url,{cache:"no-store"}); if(!response.ok) throw new Error(`SerpAPI image search failed (${response.status})`); const data=await response.json();
  return (data.images_results||[]).filter((x:any)=>usable(x?.original)&&usable(x?.link)&&x?.unsafe!==true).slice(0,10).map((x:any)=>({imageUrl:x.original as string,sourceUrl:x.link as string,sourceName:String(x.source||"Web source"),title:String(x.title||"")}));
}
async function verify(productTitle:string,brand:string,candidate:any){
  const key=process.env.OPENAI_API_KEY; if(!key) return {verified:false,reason:"OPENAI_API_KEY missing"};
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",instructions:"Verify an ecommerce product image. Return MATCH only when the image visibly represents the named product/category and the search title is plausibly relevant. Never infer exact model identity from text alone.",input:[{role:"user",content:[{type:"input_text",text:`PRODUCT: ${brand} ${productTitle}\nIMAGE SEARCH TITLE: ${candidate.title}\nSOURCE: ${candidate.sourceName}`},{type:"input_image",image_url:candidate.imageUrl}]}]})});
  if(!response.ok) return {verified:false,reason:`OpenAI verification failed (${response.status})`}; const data=await response.json(); const text=String(data.output_text||"").trim(); return {verified:/^MATCH\b/i.test(text),reason:text.slice(0,500)};
}
export async function POST(req:Request){
  try{
    if(!process.env.SERPAPI_API_KEY) return NextResponse.json({error:"SERPAPI_API_KEY is required for live image sourcing."},{status:503});
    if(!process.env.OPENAI_API_KEY) return NextResponse.json({error:"OPENAI_API_KEY is required for image verification."},{status:503});
    const body=await req.json().catch(()=>({})); const limit=Math.max(1,Math.min(5,Number(body.limit||5))); const afterId=Number(body.afterId||0); const requestedIds=Array.isArray(body.productIds)?body.productIds.map(Number).filter(Number.isFinite):[];
    const rows=requestedIds.length?await db.select().from(products).where(inArray(products.id,requestedIds)):await db.select().from(products).where(gt(products.id,afterId)).orderBy(asc(products.id)).limit(limit);
    const results:any[]=[];
    for(const product of rows.slice(0,limit)){
      try{
        const candidates=await serpImageSearch(product.title,product.brand); const verified:any[]=[];
        for(const candidate of candidates){ if(verified.length>=5) break; const ai=await verify(product.title,product.brand,candidate); if(ai.verified&&!verified.some(x=>x.imageUrl===candidate.imageUrl)) verified.push({...candidate,aiReason:ai.reason}); }
        if(!verified.length){results.push({productId:product.id,title:product.title,status:"NO_VERIFIED_IMAGE",candidatesChecked:candidates.length});continue;}
        await db.update(productImages).set({verificationStatus:"REJECTED_PLACEHOLDER_OR_STALE"}).where(eq(productImages.productId,product.id));
        await db.insert(productImages).values(verified.map((image:any,index:number)=>({productId:product.id,imageUrl:image.imageUrl,sourceUrl:image.sourceUrl,sortOrder:index,altText:`${product.title} view ${index+1}`,verificationStatus:"WEB_SEARCH_MATCHED"})));
        await db.update(products).set({imageUrl:verified[0].imageUrl,updatedAt:new Date()}).where(eq(products.id,product.id));
        await db.insert(aiActivityLogs).values({userId:product.userId,agentName:"Image-Verification-Agent",actionType:"PRODUCT_IMAGE_GALLERY_VERIFIED",message:`Verified ${verified.length} customer-facing images for ${product.title}.`,profitImpactInr:"0.00",status:"SUCCESS",metadataJson:{productId:product.id,imageCount:verified.length,images:verified.map(x=>x.imageUrl),sources:verified.map(x=>x.sourceName)}});
        results.push({productId:product.id,title:product.title,status:"VERIFIED",imageCount:verified.length});
      }catch(error){results.push({productId:product.id,title:product.title,status:"ERROR",reason:error instanceof Error?error.message:"Image refresh failed"});}
    }
    return NextResponse.json({status:"COMPLETED",processed:results.length,verified:results.filter(x=>x.status==="VERIFIED").length,failed:results.filter(x=>x.status!=="VERIFIED").length,nextAfterId:rows.length?rows[rows.length-1].id:afterId,results,policy:"Only non-placeholder images matched by OpenAI are published; up to five verified images form each gallery."});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Image refresh failed"},{status:500});}
}
export async function GET(){return NextResponse.json({agent:"Image-Verification-Agent",status:process.env.SERPAPI_API_KEY&&process.env.OPENAI_API_KEY?"ready":"blocked_missing_keys",required:["SERPAPI_API_KEY","OPENAI_API_KEY"],batchLimit:5});}
