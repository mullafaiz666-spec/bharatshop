import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
import { verifyCommerceSource } from "@/lib/source-evidence";
export const dynamic = "force-dynamic";
type Source={name:string;url?:string;cartPriceInr:number;title?:string};

export async function POST(req:Request){
  try{
    const body=await req.json(); const userId=Number(body.userId??1); const productName=String(body.productName||body.title||"").trim();
    const sellingPrice=Number(body.sellingPriceInr||0); const minMargin=Number(body.minMarginPct??35);
    let sources:Source[]=Array.isArray(body.sources)?body.sources:[];
    if(!sources.length && productName){
      const d=await serpSearch(productName,"google_shopping");
      sources=(d.shopping_results||[]).slice(0,5).map((x:any)=>({name:String(x.source||x.merchant||"Web source"),url:x.link,cartPriceInr:Number(x.extracted_price||0),title:x.title}));
    }
    if(!sources.length||!sellingPrice)return NextResponse.json({error:"productName/product sources and sellingPriceInr are required"},{status:400});

    const evaluated:any[]=[];
    for(const source of sources.slice(0,5)){
      const sourceTitle=String(source.title||productName||"").trim();
      const searchPrice=Number(source.cartPriceInr||0);
      const evidence=source.url?await verifyCommerceSource(source.url,sourceTitle,searchPrice):{checkedAt:new Date().toISOString(),requestedUrl:"",reachable:false,titleMatch:false,priceVerified:false,stockVerified:false,shippingVerified:false,error:"Missing source URL"};
      const cartPrice=evidence.priceVerified&&Number(evidence.matchedPriceInr)>0?Number(evidence.matchedPriceInr):searchPrice;
      const shipping=evidence.shippingVerified?Number(evidence.shippingCostInr||0):Number.NaN;
      const landed=Number.isFinite(cartPrice)&&Number.isFinite(shipping)?cartPrice+shipping:Number.NaN;
      const profit=Number.isFinite(landed)?sellingPrice-landed:Number.NaN;
      const margin=Number.isFinite(profit)&&sellingPrice>0?profit/sellingPrice*100:Number.NaN;
      const eligible=Boolean(evidence.reachable&&evidence.titleMatch&&evidence.priceVerified&&evidence.stockVerified&&evidence.stockAvailable===true&&evidence.shippingVerified&&Number.isFinite(margin)&&margin>=minMargin&&profit>0);
      evaluated.push({...source,cartPriceInr:cartPrice,shippingInr:Number.isFinite(shipping)?shipping:null,landedCostInr:Number.isFinite(landed)?+landed.toFixed(2):null,profitInr:Number.isFinite(profit)?+profit.toFixed(2):null,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,eligible,sourceEvidence:evidence});
    }

    const ai=await openAIJson("You are BharatShop Source Discovery Agent. Compare only the source candidates and their live page evidence. Never invent missing price, stock or shipping facts. Select only an eligible candidate. If none is eligible return selectedIndex:null. Return JSON {selectedIndex:number|null,reason:string,risks:string[]}.",{productName,sellingPrice,minMargin,evaluated});
    const idx=Number(ai.selectedIndex);const chosen=Number.isInteger(idx)?evaluated[idx]??null:null;const selected=chosen?.eligible?chosen:null;
    await db.insert(aiActivityLogs).values({userId,agentName:"Source-Discovery-Agent",actionType:"SOURCE_DISCOVERY_COMPLETED",message:`Evaluated ${evaluated.length} SearXNG candidates against live source-page evidence.`,profitImpactInr:String(selected?.profitInr??0),metadataJson:{evaluated,selected,ai,provider:"SearXNG+source-page-evidence"},status:selected?"SUCCESS":"WARNING"});
    return NextResponse.json({evaluated,selected,status:selected?"SOURCE_SELECTED":"NO_QUALIFIED_SOURCE",ai,provider:"SearXNG+source-page-evidence"});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:503})}
}
export async function GET(){const ai=Boolean(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL);return NextResponse.json({agent:"Source-Discovery-Agent",status:process.env.SEARXNG_URL&&ai?"ready":"blocked_missing_provider",provider:"SearXNG+local-AI",capabilities:["web_search","live_source_page_evidence","price_stock_shipping_gate","margin_guard"]});}
