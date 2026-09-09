import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs, products, productDetails } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
import { verifyCommerceSource } from "@/lib/source-evidence";
import { agentPrompt } from "@/lib/agents/contracts";
import { classifySource, marketplacePolicySummary, marketplaceSearchQueries } from "@/lib/suppliers/marketplace-policy";
import { catalogEconomicsPolicy } from "@/lib/catalog/economics-policy";
export const dynamic = "force-dynamic";
type Candidate={sourceId:string;sourceName:string;title:string;supplierName:string;supplierCostInr:number;sellingPriceInr:number;sourceUrl?:string};

function dedupeCandidates(items:Candidate[]){const seen=new Set<string>();return items.filter(item=>{const key=String(item.sourceUrl||`${item.sourceName}|${item.title}|${item.supplierCostInr}`).toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});}

export async function POST(request:Request){
 try{
  const body=await request.json();let candidates:Candidate[]=Array.isArray(body.candidates)?body.candidates:[];const query=String(body.productName||body.title||"").trim();const fallbackSelling=Number(body.sellingPriceInr||0);const productId=Number(body.productId||0);let persistedProduct:any=null;
  if(productId){
   const [product]=await db.select().from(products).where(eq(products.id,productId)).limit(1);if(!product)return NextResponse.json({error:"Product not found"},{status:404});persistedProduct=product;if(!query)body.title=product.title;
   const [details]=await db.select().from(productDetails).where(eq(productDetails.productId,productId)).limit(1);
   const savedUrl=String(details?.sourceUrl||"").trim();
   if(savedUrl)candidates.push({sourceId:"discovered-source",sourceName:String(product.supplierName||"Discovered source"),title:String(product.title),sourceUrl:savedUrl,supplierName:String(product.supplierName||"Discovered source"),supplierCostInr:Number(product.supplierCostInr||0),sellingPriceInr:Number(product.sellingPriceInr||fallbackSelling||0)});
  }
  const economicsPolicy=catalogEconomicsPolicy(persistedProduct?.category||body.category||"");
  const min=Number(body.minMarginPct??economicsPolicy.minMarginPct);
  const minProfit=Number(body.minProfitInr??economicsPolicy.minProfitInr);
  const effectiveQuery=query||String(body.title||persistedProduct?.title||"").trim();

  if(effectiveQuery){
   const queries=marketplaceSearchQueries(effectiveQuery);
   for(const searchQuery of queries){
    try{
     const d=await serpSearch(searchQuery,"google_shopping");
     candidates.push(...(d.shopping_results||[]).slice(0,6).map((x:any,i:number)=>({sourceId:`search-${candidates.length+i}`,sourceName:String(x.source||x.merchant||"Unknown"),title:String(x.title||effectiveQuery),sourceUrl:x.link,supplierName:String(x.source||x.merchant||"Unknown"),supplierCostInr:Number(x.extracted_price||0),sellingPriceInr:fallbackSelling||Number(persistedProduct?.sellingPriceInr||0)})));
    }catch{/* one source lane failing must not block all other lanes */}
   }
  }
  candidates=dedupeCandidates(candidates).filter(x=>x.title&&Number(x.supplierCostInr)>0&&/^https?:\/\//i.test(String(x.sourceUrl||""))).slice(0,16);
  if(!candidates.length)return NextResponse.json({error:"No source candidates found"},{status:400});

  const evaluated:any[]=[];
  for(const candidate of candidates){
   const sourcePrice=Number(candidate.supplierCostInr||0);const selling=Number(candidate.sellingPriceInr||fallbackSelling||persistedProduct?.sellingPriceInr||0);
   const policy=classifySource(String(candidate.sourceUrl||""),candidate.sourceName||candidate.supplierName);
   const evidence=candidate.sourceUrl?await verifyCommerceSource(candidate.sourceUrl,candidate.title||effectiveQuery,sourcePrice):{checkedAt:new Date().toISOString(),requestedUrl:"",reachable:false,titleMatch:false,priceVerified:false,stockVerified:false,shippingVerified:false,error:"Missing source URL"};
   const verifiedPrice=evidence.priceVerified&&Number(evidence.matchedPriceInr)>0?Number(evidence.matchedPriceInr):sourcePrice;
   const shipping=evidence.shippingVerified?Number(evidence.shippingCostInr||0):Number.NaN;
   const landed=Number.isFinite(verifiedPrice)&&Number.isFinite(shipping)?verifiedPrice+shipping:Number.NaN;
   const profit=Number.isFinite(landed)&&selling>0?selling-landed:Number.NaN;
   const margin=Number.isFinite(profit)&&selling>0?profit/selling*100:Number.NaN;
   const evidenceEligible=Boolean(evidence.reachable&&evidence.titleMatch&&evidence.priceVerified&&evidence.stockVerified&&evidence.stockAvailable===true&&evidence.shippingVerified&&selling>0&&Number.isFinite(profit)&&profit>=minProfit&&Number.isFinite(margin)&&margin>=min);
   const eligible=Boolean(evidenceEligible&&policy.fulfillmentAllowed);
   evaluated.push({...candidate,sourcePolicy:policy,supplierCostInr:verifiedPrice,shippingCostInr:Number.isFinite(shipping)?shipping:null,sellingPriceInr:selling,economics:{landedCostInr:Number.isFinite(landed)?+landed.toFixed(2):null,netProfitInr:Number.isFinite(profit)?+profit.toFixed(2):null,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,minMarginPct:min,minProfitInr:minProfit,selectionScore:eligible?Math.round(Math.min(100,Number(margin)+Math.min(20,Number(profit)/Math.max(1,minProfit)))):0},sourceEvidence:evidence,benchmarkEligible:Boolean(policy.benchmarkAllowed&&verifiedPrice>0),eligible});
  }

  const ai=await openAIJson(agentPrompt("source-verification"),{query:effectiveQuery,minMarginPct:min,minProfitInr:minProfit,evaluated,marketplacePolicy:marketplacePolicySummary});
  const idx=Number(ai.selectedIndex);const aiChoice=Number.isInteger(idx)?evaluated[idx]??null:null;
  const bestEligible=evaluated.filter(x=>x.eligible).sort((a,b)=>Number(b.economics?.selectionScore||0)-Number(a.economics?.selectionScore||0)||Number(a.economics?.landedCostInr||Infinity)-Number(b.economics?.landedCostInr||Infinity))[0]||null;
  const valid=aiChoice?.eligible&&aiChoice.economics.selectionScore>0?aiChoice:bestEligible;

  if(valid&&productId){
   const now=new Date();const [existingDetails]=await db.select().from(productDetails).where(eq(productDetails.productId,productId)).limit(1);
   await db.transaction(async tx=>{
    await tx.update(products).set({supplierName:String(valid.supplierName||valid.sourceName||"Verified source"),supplierCostInr:Number(valid.supplierCostInr).toFixed(2),shippingCostInr:Number(valid.shippingCostInr).toFixed(2),stockCount:1,updatedAt:now}).where(eq(products.id,productId));
    const persistedSpecs={...(existingDetails?.specificationsJson as Record<string,unknown>||{}),economicsPolicy:{minMarginPct:min,minProfitInr:minProfit},sourcePolicy:valid.sourcePolicy,sourceVerification:{verifiedAt:now.toISOString(),benchmarkSources:evaluated.filter(x=>x.benchmarkEligible).slice(0,5).map(x=>({sourceName:x.sourceName,sourceUrl:x.sourceUrl,priceInr:x.supplierCostInr,lane:x.sourcePolicy?.lane}))}};
    if(existingDetails)await tx.update(productDetails).set({sourceUrl:String(valid.sourceEvidence.finalUrl||valid.sourceUrl),verificationStatus:"SOURCE_VERIFIED",verifiedAt:now,specificationsJson:persistedSpecs,updatedAt:now}).where(eq(productDetails.productId,productId));
    else await tx.insert(productDetails).values({productId,sourceUrl:String(valid.sourceEvidence.finalUrl||valid.sourceUrl),verificationStatus:"SOURCE_VERIFIED",verifiedAt:now,specificationsJson:persistedSpecs,updatedAt:now});
   });
  }

  await db.insert(aiActivityLogs).values({userId:Number(body.userId??persistedProduct?.userId??1),agentName:"Verify-Select-AI",actionType:"SOURCE_VERIFICATION_COMPLETED",message:`Verified ${evaluated.length} marketplace/direct supplier candidates against live evidence, category economics and source policy.`,profitImpactInr:String(valid?.economics.netProfitInr??0),metadataJson:{productId:productId||null,category:persistedProduct?.category||body.category||null,minMarginPct:min,minProfitInr:minProfit,evaluated,selected:valid,ai,persisted:Boolean(valid&&productId)},status:valid?"SUCCESS":"WARNING"});
  return NextResponse.json({pipeline:"Saved discovery + Meesho/Shopsy/Flipkart/Amazon intelligence + direct supplier search → Source Policy → Live Evidence → Category Economics → Local Gemma → Select",candidates:evaluated,selected:valid,status:valid?"READY_FOR_LISTING":"NO_QUALIFIED_PRODUCT",persisted:Boolean(valid&&productId),economicsPolicy:{minMarginPct:min,minProfitInr:minProfit},ai,marketplacePolicy:marketplacePolicySummary});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid request"},{status:503})}
}
export async function GET(){const ai=Boolean(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL);return NextResponse.json({agent:"Verify-Select-AI",status:process.env.SEARXNG_URL&&ai?"ready":"blocked_missing_provider",capabilities:["saved_discovery_source","meesho_shopsy_flipkart_amazon_intelligence","direct_supplier_search","live_source_page_evidence","source_policy","category_economics_gate","local_gemma_verification","verified_source_persistence"],marketplacePolicy:marketplacePolicySummary});}
