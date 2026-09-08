import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs, products, productDetails } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
import { verifyCommerceSource } from "@/lib/source-evidence";
export const dynamic = "force-dynamic";
type Candidate={sourceId:string;sourceName:string;title:string;supplierName:string;supplierCostInr:number;sellingPriceInr:number;sourceUrl?:string};

export async function POST(request:Request){
 try{
  const body=await request.json();let candidates:Candidate[]=Array.isArray(body.candidates)?body.candidates:[];const query=String(body.productName||body.title||"").trim();const min=Number(body.minMarginPct??35);const fallbackSelling=Number(body.sellingPriceInr||0);const productId=Number(body.productId||0);
  if(productId){const [product]=await db.select().from(products).where(eq(products.id,productId)).limit(1);if(!product)return NextResponse.json({error:"Product not found"},{status:404});if(!query)body.title=product.title;}
  const effectiveQuery=query||String(body.title||"").trim();
  if(!candidates.length&&effectiveQuery){const d=await serpSearch(effectiveQuery,"google_shopping");candidates=(d.shopping_results||[]).slice(0,5).map((x:any,i:number)=>({sourceId:String(i),sourceName:String(x.source||x.merchant||"Unknown"),title:String(x.title||effectiveQuery),sourceUrl:x.link,supplierName:String(x.source||x.merchant||"Unknown"),supplierCostInr:Number(x.extracted_price||0),sellingPriceInr:fallbackSelling}));}
  if(!candidates.length)return NextResponse.json({error:"No source candidates found"},{status:400});

  const evaluated:any[]=[];
  for(const candidate of candidates.slice(0,5)){
   const sourcePrice=Number(candidate.supplierCostInr||0);const selling=Number(candidate.sellingPriceInr||fallbackSelling||0);
   const evidence=candidate.sourceUrl?await verifyCommerceSource(candidate.sourceUrl,candidate.title||effectiveQuery,sourcePrice):{checkedAt:new Date().toISOString(),requestedUrl:"",reachable:false,titleMatch:false,priceVerified:false,stockVerified:false,shippingVerified:false,error:"Missing source URL"};
   const verifiedPrice=evidence.priceVerified&&Number(evidence.matchedPriceInr)>0?Number(evidence.matchedPriceInr):sourcePrice;
   const shipping=evidence.shippingVerified?Number(evidence.shippingCostInr||0):Number.NaN;
   const landed=Number.isFinite(verifiedPrice)&&Number.isFinite(shipping)?verifiedPrice+shipping:Number.NaN;
   const profit=Number.isFinite(landed)&&selling>0?selling-landed:Number.NaN;
   const margin=Number.isFinite(profit)&&selling>0?profit/selling*100:Number.NaN;
   const eligible=Boolean(evidence.reachable&&evidence.titleMatch&&evidence.priceVerified&&evidence.stockVerified&&evidence.stockAvailable===true&&evidence.shippingVerified&&selling>0&&Number.isFinite(profit)&&profit>0&&Number.isFinite(margin)&&margin>=min);
   evaluated.push({...candidate,supplierCostInr:verifiedPrice,shippingCostInr:Number.isFinite(shipping)?shipping:null,sellingPriceInr:selling,economics:{landedCostInr:Number.isFinite(landed)?+landed.toFixed(2):null,netProfitInr:Number.isFinite(profit)?+profit.toFixed(2):null,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,selectionScore:eligible?Math.round(Math.min(100,Number(margin))):0},sourceEvidence:evidence,eligible});
  }

  const ai=await openAIJson("You are BharatShop Source Verification Agent. Use only the supplied live source-page evidence and economics. Never invent stock, shipping or price facts. Select only an eligible candidate, otherwise selectedIndex:null. Return JSON {selectedIndex:number|null,verificationStatus:string,reason:string,risks:string[]}.",{query:effectiveQuery,min,evaluated});
  const idx=Number(ai.selectedIndex);const chosen=Number.isInteger(idx)?evaluated[idx]??null:null;const valid=chosen?.eligible&&chosen.economics.selectionScore>0?chosen:null;

  if(valid&&productId){
   const now=new Date();const [existingDetails]=await db.select().from(productDetails).where(eq(productDetails.productId,productId)).limit(1);
   await db.transaction(async tx=>{
    await tx.update(products).set({supplierName:String(valid.supplierName||valid.sourceName||"Verified source"),supplierCostInr:Number(valid.supplierCostInr).toFixed(2),shippingCostInr:Number(valid.shippingCostInr).toFixed(2),stockCount:1,updatedAt:now}).where(eq(products.id,productId));
    if(existingDetails)await tx.update(productDetails).set({sourceUrl:String(valid.sourceEvidence.finalUrl||valid.sourceUrl),verificationStatus:"SOURCE_VERIFIED",verifiedAt:now,updatedAt:now}).where(eq(productDetails.productId,productId));
    else await tx.insert(productDetails).values({productId,sourceUrl:String(valid.sourceEvidence.finalUrl||valid.sourceUrl),verificationStatus:"SOURCE_VERIFIED",verifiedAt:now,updatedAt:now});
   });
  }

  await db.insert(aiActivityLogs).values({userId:Number(body.userId??1),agentName:"Verify-Select-AI",actionType:"SOURCE_VERIFICATION_COMPLETED",message:`Verified ${evaluated.length} source candidates against live source-page evidence.`,profitImpactInr:String(valid?.economics.netProfitInr??0),metadataJson:{productId:productId||null,evaluated,selected:valid,ai,persisted:Boolean(valid&&productId)},status:valid?"SUCCESS":"WARNING"});
  return NextResponse.json({pipeline:"Search → Live Source Evidence → Local AI → Economics → Select",candidates:evaluated,selected:valid,status:valid?"READY_FOR_LISTING":"NO_QUALIFIED_PRODUCT",persisted:Boolean(valid&&productId),ai});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid request"},{status:503})}
}
export async function GET(){const ai=Boolean(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL);return NextResponse.json({agent:"Verify-Select-AI",status:process.env.SEARXNG_URL&&ai?"ready":"blocked_missing_provider",capabilities:["live_source_page_evidence","local_ai_verification","economics_gate","verified_source_persistence"]});}
