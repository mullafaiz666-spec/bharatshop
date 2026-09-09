import { NextResponse } from "next/server";
import { db } from "@/db";
import { storefrontOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createRazorpayOrder } from "@/lib/payments/gateway";
import { appendPaymentMeta, readPaymentMeta } from "@/lib/payments/token-plan";

export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{
  const body=(await req.json()) as {orderRefs?:unknown[];orderRef?:unknown};const rawRefs:unknown[]=Array.isArray(body.orderRefs)?body.orderRefs:[body.orderRef];const refs:string[]=[...new Set(rawRefs.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,20);if(!refs.length)return NextResponse.json({error:"orderRef or orderRefs is required"},{status:400});
  const rows:Array<typeof storefrontOrders.$inferSelect>=[];for(const ref of refs){const[row]=await db.select().from(storefrontOrders).where(eq(storefrontOrders.orderRef,ref)).limit(1);if(!row)return NextResponse.json({error:`Order ${ref} not found`},{status:404});rows.push(row);}
  if(rows.some(o=>!["PARTIAL_COD_RAZORPAY","RAZORPAY"].includes(String(o.paymentMode))))return NextResponse.json({error:"These orders are not assigned to Razorpay"},{status:409});
  if(rows.some(o=>!["TOKEN_PENDING","PAYMENT_PENDING","FAILED"].includes(String(o.paymentStatus))))return NextResponse.json({error:"One or more orders are not payable in the current state"},{status:409});
  const amounts=rows.map(o=>String(o.paymentMode)==="PARTIAL_COD_RAZORPAY"?Number(readPaymentMeta(o.notes,"confirmation_amount_inr")):Number(o.totalAmountInr));const total=Number(amounts.reduce((a,b)=>a+b,0).toFixed(2));if(!Number.isFinite(total)||total<1)return NextResponse.json({error:"Invalid confirmation amount"},{status:400});
  const receipt=`BST${Date.now().toString(36).toUpperCase()}`.slice(0,40),created=await createRazorpayOrder({amountInr:total,receipt,notes:{checkout:"BharatShop",orderRefs:refs.join(",").slice(0,250),paymentStrategy:rows.every(o=>String(o.paymentMode).startsWith("PARTIAL_COD_"))?"PARTIAL_COD":"ONLINE"}});
  for(const o of rows){const notes=appendPaymentMeta(o.notes??undefined,{razorpay_order_id:created.orderId,gateway_amount_inr:total.toFixed(2)});await db.update(storefrontOrders).set({notes,paymentStatus:String(o.paymentMode).startsWith("PARTIAL_COD_")?"TOKEN_PENDING":"PAYMENT_PENDING"}).where(eq(storefrontOrders.id,o.id));}
  return NextResponse.json({provider:"razorpay",mode:created.mode,keyId:created.keyId,razorpayOrderId:created.orderId,amount:created.amount,currency:created.currency,orderRefs:refs,confirmationAmountInr:total},{headers:{"Cache-Control":"no-store"}});
 }catch(error:unknown){const message=error instanceof Error?error.message:"Razorpay order creation failed";return NextResponse.json({error:message},{status:/not configured/i.test(message)?503:500});}
}
