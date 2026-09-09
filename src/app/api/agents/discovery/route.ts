import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
import { verifyCommerceSource } from "@/lib/source-evidence";
import { agentPrompt } from "@/lib/agents/contracts";
import { classifySource, marketplacePolicySummary } from "@/lib/suppliers/marketplace-policy";
export const dynamic = "force-dynamic";
type Source={name:string;url?:string;cartPriceInr:number;title?:string};

async function discoverLanes(productName:string){
  const queries=[
    `${productName} Meesho Shopsy Flipkart Amazon India price`,
    `${productName} wholesale manufacturer supplier India price`,
  ];
  const all:Source[]=[];
  for(const query of queries){
    try{
      const d=await serpSearch(query,"google_shopping");
      for(const x of (d.shopping_results||[]).slice(0,8)) all.push({name:String(x.source||x.merchant||"Web source"),url:x.link,cartPriceInr:Number(x.extracted_price||0),title:x.title});
    }catch{/* a failed lane must not erase other evidence */}
  }
  const seen=new Set<string>();
  return all.filter(x=>{const key=String(x.url||`${x.name}|${x.title}`).toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
}

export async function POST(req:Request){
  try{
    const body=await req.json(); const userId=Number(body.userId??1); const productName=String(body.productName||body.title||"").trim();
    const sellingPrice=Number(body.sellingPriceInr||0); const minMargin=Number(body.minMarginPct??35);
    let sources:Source[]=Array.isArray(body.sources)?body.sources:[];
    if(!sources.length && productName) sources=await discoverLanes(productName);
    if(!sources.length||!sellingPrice)return NextResponse.json({error:"productName/product sources and sellingPriceInr are required"},{status:400});

    const evaluated:any[]=[];
    for(const source of sources.slice(0,12)){
      const sourceTitle=String(source.title||productName||"").trim();
      const searchPrice=Number(source.cartPriceInr||0);
      const policy=classifySource(String(source.url||""),source.name);
      // Retail marketplaces are useful price intelligence even when direct fulfillment is disabled.
      const evidence=source.url?await verifyCommerceSource(source.url,sourceTitle,searchPrice):{checkedAt:new Date().toISOString(),requestedUrl:"",reachable:false,titleMatch:false,priceVerified:false,stockVerified:false,shippingVerified:false,error:"Missing source URL"};
      const cartPrice=evidence.priceVerified&&Number(evidence.matchedPriceInr)>0?Number(evidence.matchedPriceInr):searchPrice;
      const shipping=evidence.shippingVerified?Number(evidence.shippingCostInr||0):Number.NaN;
      const landed=Number.isFinite(cartPrice)&&Number.isFinite(shipping)?cartPrice+shipping:Number.NaN;
      const profit=Number.isFinite(landed)?sellingPrice-landed:Number.NaN;
      const margin=Number.isFinite(profit)&&sellingPrice>0?profit/sellingPrice*100:Number.NaN;
      const evidenceEligible=Boolean(evidence.reachable&&evidence.titleMatch&&evidence.priceVerified&&evidence.stockVerified&&evidence.stockAvailable===true&&evidence.shippingVerified&&Number.isFinite(margin)&&margin>=minMargin&&profit>0);
      const eligible=Boolean(evidenceEligible&&policy.fulfillmentAllowed);
      evaluated.push({...source,sourcePolicy:policy,cartPriceInr:cartPrice,shippingInr:Number.isFinite(shipping)?shipping:null,landedCostInr:Number.isFinite(landed)?+landed.toFixed(2):null,profitInr:Number.isFinite(profit)?+profit.toFixed(2):null,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,benchmarkEligible:Boolean(policy.benchmarkAllowed&&cartPrice>0),eligible,sourceEvidence:evidence});
    }

    const ai=await openAIJson(agentPrompt("source-discovery"),{productName,sellingPrice,minMargin,evaluated,marketplacePolicy:marketplacePolicySummary});
    const idx=Number(ai.selectedIndex);const chosen=Number.isInteger(idx)?evaluated[idx]??null:null;const selected=chosen?.eligible?chosen:null;
    const benchmark=evaluated.filter(x=>x.benchmarkEligible).sort((a,b)=>(a.cartPriceInr||Infinity)-(b.cartPriceInr||Infinity))[0]||null;
    await db.insert(aiActivityLogs).values({userId,agentName:"Source-Discovery-Agent",actionType:"SOURCE_DISCOVERY_COMPLETED",message:`Evaluated ${evaluated.length} direct/marketplace source candidates against source policy and live evidence.`,profitImpactInr:String(selected?.profitInr??0),metadataJson:{evaluated,selected,benchmark,ai,provider:"SearXNG+source-policy+source-page-evidence"},status:selected?"SUCCESS":"WARNING"});
    return NextResponse.json({evaluated,selected,lowestBenchmark:benchmark,status:selected?"SOURCE_SELECTED":"NO_QUALIFIED_SOURCE",ai,provider:"SearXNG+source-policy+source-page-evidence",marketplacePolicy:marketplacePolicySummary});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:503})}
}
export async function GET(){const ai=Boolean(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL);return NextResponse.json({agent:"Source-Discovery-Agent",status:process.env.SEARXNG_URL&&ai?"ready":"blocked_missing_provider",provider:"SearXNG+local-Gemma",capabilities:["multi-lane_search","meesho_shopsy_flipkart_amazon_benchmark","direct_supplier_search","live_source_page_evidence","source_policy","price_stock_shipping_gate","margin_guard"],marketplacePolicy:marketplacePolicySummary});}
