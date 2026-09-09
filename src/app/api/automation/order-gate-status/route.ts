import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function automationToken(){return process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN||process.env.CRON_SECRET||"";}
function authorized(req:Request){const expected=automationToken();if(!expected)return false;const supplied=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||req.headers.get("x-automation-token")||"";return supplied===expected;}
function isRealClientOrder(order:any){
 const ref=String(order?.orderRef||"").trim(),source=String(order?.source||"").toLowerCase(),shopifyId=String(order?.shopifyOrderId||"").trim();
 const markers=`${ref} ${source} ${order?.notes||""} ${order?.customerName||""} ${order?.customerEmail||""}`.toLowerCase();
 if(/\b(test|demo|acceptance|synthetic|fixture|seed)\b/i.test(markers))return false;
 const ownWebsite=source==="own_website"&&/^BS-WEB-/i.test(ref),shopify=source.includes("shopify")||shopifyId.length>0;
 const email=String(order?.customerEmail||"").trim(),phone=String(order?.customerPhone||"").replace(/\D/g,"");
 return Boolean((ownWebsite||shopify)&&email.includes("@")&&phone.length>=10&&Number(order?.totalAmountInr)>0);
}

async function status(){
 const candidates=await db.select({id:storefrontOrders.id,orderRef:storefrontOrders.orderRef,customerName:storefrontOrders.customerName,customerEmail:storefrontOrders.customerEmail,customerPhone:storefrontOrders.customerPhone,totalAmountInr:storefrontOrders.totalAmountInr,fulfillmentStatus:storefrontOrders.fulfillmentStatus,source:storefrontOrders.source,shopifyOrderId:storefrontOrders.shopifyOrderId,notes:storefrontOrders.notes,orderedAt:storefrontOrders.orderedAt}).from(storefrontOrders).orderBy(desc(storefrontOrders.orderedAt)).limit(100);
 const realOrders=candidates.filter(isRealClientOrder);
 return {status:"READY",candidateOrderCount:candidates.length,realOrderCount:realOrders.length,humanInteractionGate:realOrders.length>0,policy:"No human order gate before a genuine BS-WEB/Shopify customer order.",orders:realOrders.map(o=>({id:o.id,orderRef:o.orderRef,fulfillmentStatus:o.fulfillmentStatus,source:o.source}))};
}

export async function GET(req:Request){if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await status(),{headers:{"Cache-Control":"no-store"}});}catch(e){return NextResponse.json({status:"FAILED",error:e instanceof Error?e.message:"Order gate status failed"},{status:503});}}
export async function POST(req:Request){return GET(req);}
