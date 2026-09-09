import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs, marketingCampaigns, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyMarketingConnections } from "@/lib/marketing/connections";
export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function GET(){
  const configured=Boolean(process.env.META_ACCESS_TOKEN?.trim()&&process.env.META_AD_ACCOUNT_ID?.trim());
  return NextResponse.json({connector:"Meta Marketing API",configured,creationStatus:"PAUSED_ONLY",activation:"explicit_owner_approval_required",required:["META_ACCESS_TOKEN","META_AD_ACCOUNT_ID"]},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:Request){
  try{
    const body=await req.json();const campaignId=Number(body.campaignId);const approved=body.approved===true;
    if(!Number.isInteger(campaignId)||campaignId<=0)return NextResponse.json({error:"campaignId is required"},{status:400});
    if(!approved)return NextResponse.json({status:"APPROVAL_REQUIRED",error:"Explicit approval is required to create an external Meta campaign container. It will still be created PAUSED."},{status:403});
    const [campaign]=await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id,campaignId)).limit(1);
    if(!campaign)return NextResponse.json({error:"Campaign draft not found"},{status:404});
    if(!["READY_FOR_CONNECTOR","DRAFT"].includes(campaign.status))return NextResponse.json({error:`Campaign status ${campaign.status} is not eligible for Meta handoff`},{status:409});
    const [product]=await db.select().from(products).where(eq(products.id,campaign.productId)).limit(1);
    if(!product||product.status!=="Published"||Number(product.netProfitInr)<=0)return NextResponse.json({error:"Published profitable product is required before Meta handoff"},{status:422});
    const channels=await verifyMarketingConnections();const meta=channels.find(c=>c.key==="meta");
    if(!meta?.connected||meta.status!=="VERIFIED")return NextResponse.json({error:"Meta ad account is not verified",connection:meta},{status:503});
    const version=process.env.META_GRAPH_API_VERSION||"v26.0",adAccount=process.env.META_AD_ACCOUNT_ID!.replace(/^act_/,""),token=process.env.META_ACCESS_TOKEN!;
    const form=new URLSearchParams({name:`BharatShop | ${campaign.productTitle} | ${campaign.id}`,objective:"OUTCOME_SALES",status:"PAUSED",buying_type:"AUCTION",special_ad_categories:"[]"});
    const response=await fetch(`https://graph.facebook.com/${version}/act_${adAccount}/campaigns`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/x-www-form-urlencoded"},body:form,cache:"no-store",signal:AbortSignal.timeout(20000)});
    let result:any=null;try{result=await response.json();}catch{}
    if(!response.ok||!result?.id)return NextResponse.json({error:`Meta rejected paused campaign creation (HTTP ${response.status})`},{status:502});
    await db.update(marketingCampaigns).set({status:"META_PAUSED"}).where(eq(marketingCampaigns.id,campaign.id));
    await db.insert(aiActivityLogs).values({userId:campaign.userId,agentName:"Advertising-Agent",actionType:"META_CAMPAIGN_CREATED_PAUSED",message:`Created PAUSED Meta campaign container for ${campaign.productTitle}. No spend was enabled.`,profitImpactInr:"0.00",metadataJson:{localCampaignId:campaign.id,metaCampaignId:String(result.id),status:"PAUSED",provider:"Meta Marketing API"},status:"SUCCESS"});
    return NextResponse.json({status:"META_CAMPAIGN_CREATED_PAUSED",localCampaignId:campaign.id,metaCampaignId:String(result.id),externalStatus:"PAUSED",spendEnabled:false,next:"Create ad set/creative only after campaign economics and creative are approved; activation remains a separate explicit action."},{status:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Meta campaign handoff failed"},{status:500});}
}
