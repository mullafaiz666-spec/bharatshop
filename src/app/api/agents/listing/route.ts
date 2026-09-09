import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, productDetails, aiActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";

export const dynamic="force-dynamic";
const MIN_IMAGES=4,MAX_IMAGES=8,MIN_CONFIDENCE=.75;
const VERIFIED_MEDIA=new Set(["AI_VISION_VERIFIED","LOCAL_EVIDENCE_VERIFIED"]),VERIFIED_PROVIDERS=new Set(["local-ai","local-evidence"]);
const realUrl=(v:unknown)=>/^https?:\/\//i.test(String(v||""));
const specsOf=(d:any)=>d?.specificationsJson&&typeof d.specificationsJson==="object"&&!Array.isArray(d.specificationsJson)?d.specificationsJson as Record<string,any>:{};
const isMto=(p:any,d:any)=>p.supplierName==="Qikink"&&p.brand==="BharatShop Studio"&&String(specsOf(d).inventoryMode||"").toUpperCase()==="MADE_TO_ORDER"&&String(specsOf(d).productionSupplier||"").toLowerCase()==="qikink";

export async function POST(req:Request){
 try{
  const{productId,ceoApproved}=await req.json();if(!productId)return NextResponse.json({error:"productId required"},{status:400});
  const[p]=await db.select().from(products).where(eq(products.id,Number(productId))).limit(1);if(!p)return NextResponse.json({error:"Product not found"},{status:404});
  if(p.status!=="CEO_APPROVED"||ceoApproved!==true)return NextResponse.json({status:"BLOCKED",error:"CEO approval is required before storefront publication"},{status:403});
  const[details]=await db.select().from(productDetails).where(eq(productDetails.productId,p.id)).limit(1);if(!details||details.verificationStatus!=="SOURCE_VERIFIED"||!realUrl(details.sourceUrl))return NextResponse.json({status:"BLOCKED",error:"Persisted SOURCE_VERIFIED supplier/production evidence is required"},{status:422});
  const specs=specsOf(details),hasSpecs=Object.keys(specs).length>0,mto=isMto(p,details);if(!hasSpecs)return NextResponse.json({status:"BLOCKED",error:"Evidence-backed product specifications are required"},{status:422});
  const images=await db.select().from(productImages).where(eq(productImages.productId,p.id));
  const verifiedImages=images.filter(i=>{
    if(mto)return String(i.verificationStatus)==="AI_GENERATED_ORIGINAL"&&String(i.verificationProvider)==="bharatshop-studio"&&Number(i.verificationConfidence)>=.99&&!!i.verifiedAt&&realUrl(i.imageUrl)&&String(specs.designOrigin)==="BharatShop Studio"&&String(specs.productionSupplier)==="Qikink";
    return VERIFIED_MEDIA.has(String(i.verificationStatus))&&VERIFIED_PROVIDERS.has(String(i.verificationProvider))&&Number(i.verificationConfidence)>=MIN_CONFIDENCE&&!!i.verifiedAt&&realUrl(i.imageUrl)&&realUrl(i.sourceUrl);
  }).sort((a,b)=>a.sortOrder-b.sortOrder).slice(0,MAX_IMAGES);
  if(verifiedImages.length<MIN_IMAGES)return NextResponse.json({status:"BLOCKED",error:`At least ${MIN_IMAGES} verified media items are required`},{status:422});
  const selling=Number(p.sellingPriceInr),cost=Number(p.supplierCostInr)+Number(p.shippingCostInr)+Number(p.supplierCostInr)*Number(p.gstPct)/100,profit=selling-cost,margin=selling?profit/selling*100:0,availabilityValid=mto||Number(p.stockCount)>0;
  if(selling<=0||profit<=0||!availabilityValid)return NextResponse.json({status:"BLOCKED",error:"Product failed profitability or availability gate"},{status:422});
  let ai:any={},copyProvider="verified-facts-fallback",aiError="";
  try{ai=await openAIJson("You are BharatShop's local listing editor. Write natural customer-facing ecommerce copy using only supplied verified facts. Do not mention internal verification, supplier costs, margins, AI systems or technical evidence. Do not invent certifications or claims. Return JSON with title,description,marketingCopy,targetAudience,hook,cta.",{product:{brand:p.brand,title:p.title,sellingPriceInr:selling,availability:mto?"made to order by Qikink":"in stock from verified supplier",productionSupplier:mto?"Qikink":undefined,sourceName:p.supplierName,specifications:specs},marginPct:+margin.toFixed(2)},{timeoutMs:4000,maxTokens:600});copyProvider="local-Gemma";}catch(error){aiError=error instanceof Error?error.message:String(error);}
  const fallback=mto?`${p.title}. An original BharatShop Studio design produced to order by Qikink.`:`${p.title}. Selected for clear pricing, current supplier availability and a straightforward BharatShop shopping experience.`;
  const title=String(ai.title||p.title).trim(),description=String(ai.description||details.description||fallback).trim(),marketingCopy=String(ai.marketingCopy||description||fallback).trim(),targetAudience=String(ai.targetAudience||p.aiTargetAudience||"Indian online shoppers").trim();
  const listing={title,description,sellingPriceInr:selling,marginPct:+margin.toFixed(2),netProfitInr:+profit.toFixed(2),marketingCopy,targetAudience,copyProvider,availabilityMode:mto?"MADE_TO_ORDER":"IN_STOCK",productionSupplier:mto?"Qikink":p.supplierName,sourceEvidence:{sourceUrl:details.sourceUrl,sourceName:p.supplierName,verificationStatus:details.verificationStatus},mediaEvidence:verifiedImages.map(i=>({imageUrl:i.imageUrl,sourceUrl:i.sourceUrl,verificationStatus:i.verificationStatus,confidence:Number(i.verificationConfidence),provider:i.verificationProvider})),adCreativeData:{hook:String(ai.hook||marketingCopy),audience:targetAudience,imageUrl:verifiedImages[0].imageUrl,cta:String(ai.cta||"Shop Now")}};
  await db.update(products).set({imageUrl:verifiedImages[0].imageUrl,netProfitInr:listing.netProfitInr.toFixed(2),customMarginPct:listing.marginPct.toFixed(2),aiMarketingCopy:marketingCopy,aiTargetAudience:targetAudience,status:"Published",updatedAt:new Date()}).where(eq(products.id,p.id));
  await db.insert(aiActivityLogs).values({userId:p.userId,agentName:"Listing-Creative-Agent",actionType:"LISTING_OPTIMIZED",message:`${copyProvider==="local-Gemma"?"Local Gemma":"Verified-facts fallback"} prepared a customer-ready listing for ${p.title}.`,profitImpactInr:String(listing.netProfitInr),metadataJson:{listing,ai,aiError,ceoApproved:true,provider:copyProvider},status:aiError?"WARNING":"SUCCESS"});
  await db.insert(aiActivityLogs).values({userId:p.userId,agentName:"Listing-Creative-Agent",actionType:"STOREFRONT_PUBLISHED",message:`Published ${p.title} after source/production, media, specification, economics and CEO gates.`,profitImpactInr:String(listing.netProfitInr),metadataJson:{productId:p.id,status:"Published",ceoApproved:true,verifiedImageCount:verifiedImages.length,copyProvider,availabilityMode:listing.availabilityMode},status:"SUCCESS"});
  return NextResponse.json({listing,storefront:{published:true,productId:p.id,status:"Published"},aiFallbackUsed:Boolean(aiError)});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:503});}
}
export async function GET(){return NextResponse.json({agent:"Listing-Creative-Agent",status:"ready",provider:"local-Gemma (4s max) with verified-facts fallback",publicationGate:"Physical: SOURCE_VERIFIED + 4-8 source-backed media + stock + specs + economics + CEO; Qikink Studio: verified Qikink mapping + 4 local original design views + made-to-order + economics + CEO",capabilities:["bounded_local_ai_copy","verified_facts_fallback","qikink_made_to_order","publication_gate"]});}
