import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";
import { serpSearch, openAIJson } from "@/lib/ai/agent-tools";
export const dynamic = "force-dynamic";
type Source={name:string;url?:string;cartPriceInr:number;shippingInr:number;stock:number;deliveryDays?:number;eligible?:boolean;title?:string};

export async function POST(req:Request){
  try{
    const body=await req.json(); const userId=Number(body.userId??1); const productName=String(body.productName||body.title||"").trim();
    const sellingPrice=Number(body.sellingPriceInr||0); const minMargin=Number(body.minMarginPct??35);
    let sources:Source[]=Array.isArray(body.sources)?body.sources:[];
    if(!sources.length && productName){
      const d=await serpSearch(productName,"google_shopping");
      sources=(d.shopping_results||[]).slice(0,10).map((x:any)=>({name:String(x.source||x.merchant||"Unknown source"),url:x.link,cartPriceInr:Number(String(x.extracted_price??x.price??"0").replace(/[^0-9.]/g,""))||0,shippingInr:0,stock:1,deliveryDays:7,title:x.title}));
    }
    if(!sources.length||!sellingPrice)return NextResponse.json({error:"productName/product sources and sellingPriceInr are required"},{status:400});
    const evaluated=sources.map(s=>{const landed=s.cartPriceInr+s.shippingInr;const profit=sellingPrice-landed;const margin=sellingPrice?profit/sellingPrice*100:0;return {...s,landedCostInr:+landed.toFixed(2),profitInr:+profit.toFixed(2),marginPct:+margin.toFixed(2),eligible:s.eligible!==false&&s.stock>0&&s.cartPriceInr>0&&margin>=minMargin}});
    const ai=await openAIJson("You are BharatShop Source Discovery Agent. Compare live ecommerce sources. Never invent missing facts. Select the best eligible source using price, stock, delivery and margin. Return JSON {selectedIndex:number|null,reason:string,risks:string[]}.",{productName,sellingPrice,minMargin,evaluated});
    const selected=Number.isInteger(Number(ai.selectedIndex))?evaluated[Number(ai.selectedIndex)]??null:null;
    await db.insert(aiActivityLogs).values({userId,agentName:"Source-Discovery-Agent",actionType:"SOURCE_DISCOVERY_COMPLETED",message:`Evaluated ${evaluated.length} live source candidates.`,profitImpactInr:String(selected?.profitInr??0),metadataJson:{evaluated,selected,ai},status:selected?"SUCCESS":"WARNING"});
    return NextResponse.json({evaluated,selected,status:selected?"SOURCE_SELECTED":"NO_QUALIFIED_SOURCE",ai});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:503})}
}
export async function GET(){return NextResponse.json({agent:"Source-Discovery-Agent",status:process.env.SERPAPI_API_KEY&&process.env.OPENAI_API_KEY?"ready":"blocked_missing_keys",capabilities:["live_shopping_search","source_comparison","margin_guard"]})}
