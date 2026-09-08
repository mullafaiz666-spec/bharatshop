import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, productDetails, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";
import { verifyCommerceSource } from "@/lib/source-evidence";
export const dynamic="force-dynamic";

export async function POST(req:Request){
 try{
  const body=await req.json();const orderId=Number(body.orderId);if(!orderId)return NextResponse.json({error:"orderId required"},{status:400});
  const [row]=await db.select({order:orders,product:products}).from(orders).leftJoin(products,eq(orders.productId,products.id)).where(eq(orders.id,orderId)).limit(1);
  if(!row)return NextResponse.json({error:"Order not found"},{status:404});const o=row.order,p=row.product;if(!p)return NextResponse.json({error:"No selected source/product attached",status:"BLOCKED"},{status:409});
  const [details]=await db.select().from(productDetails).where(eq(productDetails.productId,p.id)).limit(1);
  const sourceUrl=String(details?.sourceUrl||"").trim();
  if(!sourceUrl)return NextResponse.json({error:"No verified supplier source URL is persisted for this product",status:"RECHECK_REQUIRED"},{status:409});

  const expectedSupplierPrice=Number(p.supplierCostInr);const evidence=await verifyCommerceSource(sourceUrl,p.title,expectedSupplierPrice);
  const cartPrice=evidence.priceVerified&&Number(evidence.matchedPriceInr)>0?Number(evidence.matchedPriceInr):Number.NaN;
  const shipping=evidence.shippingVerified?Number(evidence.shippingCostInr||0):Number.NaN;
  const minMargin=Number(body.minMarginPct??35);
  const customerPaid=Number(o.customerPaidInr);
  const margin=Number.isFinite(cartPrice)&&Number.isFinite(shipping)&&customerPaid>0?(customerPaid-cartPrice-shipping)/customerPaid*100:Number.NaN;
  const checks={sourceReachable:evidence.reachable,titleMatch:evidence.titleMatch,priceVerified:evidence.priceVerified,stockVerified:evidence.stockVerified,stockAvailable:evidence.stockAvailable===true,shippingVerified:evidence.shippingVerified,margin:Number.isFinite(margin)&&margin>=minMargin};
  const ai=await openAIJson("You are BharatShop Order Recheck Agent. Decide whether a supplier purchase is economically and operationally safe using only the live source-page evidence provided. Never invent missing facts. If any required evidence is missing, HOLD. Return JSON {decision:'PASS'|'HOLD',reason:string,risks:string[]}.",{order:{orderNumber:o.orderNumber,customerPaidInr:o.customerPaidInr,paymentMode:o.paymentMode,paymentStatus:o.paymentStatus},product:{title:p.title,source:p.supplierName,sourceUrl},liveEvidence:{source:evidence,cartPriceInr:Number.isFinite(cartPrice)?cartPrice:null,shippingInr:Number.isFinite(shipping)?shipping:null,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,checks}});
  const passed=ai.decision==="PASS"&&Object.values(checks).every(Boolean);const status=passed?"PURCHASE_PENDING":"RECHECK_REQUIRED";
  const decision={checkedAt:new Date().toISOString(),source:p.supplierName,sourceUrl,cartPriceInr:Number.isFinite(cartPrice)?cartPrice:null,shippingInr:Number.isFinite(shipping)?shipping:null,stockAvailable:evidence.stockAvailable===true,marginPct:Number.isFinite(margin)?+margin.toFixed(2):null,minMarginPct:minMargin,checks,sourceEvidence:evidence,ai};
  const update:any={fulfillmentStatus:status,aiDecisionLog:`${o.aiDecisionLog}; order_time_recheck=${JSON.stringify(decision)}`};
  if(Number.isFinite(cartPrice))update.supplierCostInr=String(cartPrice);
  const [updated]=await db.update(orders).set(update).where(eq(orders.id,orderId)).returning();
  await db.insert(aiActivityLogs).values({userId:updated.userId,agentName:"Order-Recheck-Agent",actionType:passed?"RECHECK_PASSED":"RECHECK_BLOCKED",message:`${updated.orderNumber}: ${passed?"live source recheck passed":"live source recheck held order"}.`,profitImpactInr:String(updated.netProfitInr),metadataJson:decision,status:passed?"SUCCESS":"BLOCKED"});
  return NextResponse.json({status,passed,checks,economics:decision,order:updated});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:503})}
}
export async function GET(){const ai=Boolean(process.env.AI_BASE_URL||process.env.LOCAL_AI_BASE_URL);return NextResponse.json({agent:"Order-Recheck-Agent",status:ai?"ready":"blocked_missing_provider",humanGate:"Human approval before supplier purchase",evidencePolicy:"Persisted supplier source URL + live price/stock/shipping evidence required"})}
