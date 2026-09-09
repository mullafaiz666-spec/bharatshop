import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { catalogEconomicsPolicy } from "@/lib/catalog/economics-policy";

export const dynamic="force-dynamic";
export const maxDuration=300;

function token(){return process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN||"";}
function auth(req:Request){const expected=token();const supplied=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||req.headers.get("x-automation-token")||"";return !!expected&&supplied===expected;}

function balancedSelection(rows:typeof products.$inferSelect[],limit:number){
 const selected:typeof rows=[];const categories=new Set<string>();
 for(const product of rows){if(selected.length>=limit)break;const category=String(product.category||"Other");if(categories.has(category))continue;categories.add(category);selected.push(product);}
 if(selected.length<limit){const ids=new Set(selected.map(x=>x.id));for(const product of rows){if(selected.length>=limit)break;if(ids.has(product.id))continue;selected.push(product);ids.add(product.id);}}
 return selected;
}

export async function POST(req:Request){
 try{
  if(!auth(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));const limit=Math.max(1,Math.min(8,Number(body.limit||3)));
  // Fresh discoveries are inserted with the highest IDs. Within that recent queue, select one
  // product per category first so fashion/home cannot starve mobiles/laptops or vice versa.
  const rows=await db.select().from(products).where(or(eq(products.status,"STAGED"),eq(products.status,"CEO_PENDING"))).orderBy(desc(products.id));
  const selected=balancedSelection(rows,limit);const origin=new URL(req.url).origin;const results:any[]=[];
  for(const product of selected){
   try{
    const policy=catalogEconomicsPolicy(product.category);
    const minMarginPct=Number(body.minMarginPct??policy.minMarginPct);
    const minProfitInr=Number(body.minProfitInr??policy.minProfitInr);
    const t=token();const response=await fetch(`${origin}/api/agents/source-verify`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`,"x-automation-token":t},body:JSON.stringify({productId:product.id,userId:product.userId,title:product.title,productName:product.title,category:product.category,sellingPriceInr:Number(product.sellingPriceInr),minMarginPct,minProfitInr}),cache:"no-store",signal:AbortSignal.timeout(90000)});
    const raw=await response.text();let data:any;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,2000)}}
    results.push({productId:product.id,category:product.category,httpStatus:response.status,ok:response.ok,status:data?.status||null,persisted:Boolean(data?.persisted),economicsPolicy:data?.economicsPolicy||{minMarginPct,minProfitInr},selected:data?.selected||null,error:data?.error||null});
   }catch(error){results.push({productId:product.id,category:product.category,ok:false,status:"ERROR",error:error instanceof Error?error.message:String(error)});}
  }
  const errors=results.filter(x=>x.status==="ERROR"||Number(x.httpStatus)>=500).length;
  return NextResponse.json({status:errors?"PARTIAL":"COMPLETED",processed:selected.length,verified:results.filter(x=>x.persisted).length,unqualified:results.filter(x=>x.status==="NO_QUALIFIED_PRODUCT").length,errors,results,selectionPolicy:"newest queue with one candidate per category first",policy:"Only live source-page evidence can be persisted as SOURCE_VERIFIED. Category-aware minimum margin/profit prevents high-ticket electronics from being rejected by fashion-style margin rules."},{status:errors?207:200});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Source verification batch failed"},{status:500});}
}

export async function GET(){return NextResponse.json({worker:"source-verification",status:process.env.SEARXNG_URL&&(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL)?"ready":"blocked_missing_provider",maxBatch:8,selectionPolicy:"newest-category-balanced",economicsPolicy:"category-aware"});}
