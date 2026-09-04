import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, productDetails, products } from "@/db/schema";
import { desc } from "drizzle-orm";

const BAD_IMAGE=/(?:unsplash\.com|source\.unsplash\.com|via\.placeholder\.com|placeholder\.com|placehold\.co|placehold\.it|dummyimage\.com|picsum\.photos|loremflickr\.com|placekitten\.com)/i;
const APPROVED=new Set(["AI_VISION_VERIFIED"]);
const MIN_IMAGES=4;
const MIN_CONFIDENCE=0.75;
const VERIFICATION_PROVIDER="local-ai";
export const dynamic = "force-dynamic";

const cleanUrl=(value:unknown)=>{const url=String(value||"").trim();return /^https:\/\//i.test(url)&&!BAD_IMAGE.test(url)?url:""};

export async function GET(req:Request){
 const {searchParams}=new URL(req.url);const category=searchParams.get("category")||"";const search=searchParams.get("search")||searchParams.get("query")||"";const sort=searchParams.get("sort")||"aiScore";const limit=Math.min(Math.max(parseInt(searchParams.get("limit")||"24",10)||24,1),96);const page=Math.max(parseInt(searchParams.get("page")||"1",10)||1,1);const featured=searchParams.get("featured")==="true";
 const all=await db.select().from(products).orderBy(desc(products.aiScore));const imageRows=await db.select().from(productImages);const detailRows=await db.select().from(productDetails);const detailMap=new Map(detailRows.map(x=>[x.productId,x]));const galleryMap=new Map<number,{url:string;label:string;order:number}[]>();
 for(const row of imageRows){const url=cleanUrl(row.imageUrl);if(!url||!APPROVED.has(String(row.verificationStatus))||Number(row.verificationConfidence)<MIN_CONFIDENCE||String(row.verificationProvider)!==VERIFICATION_PROVIDER||!row.verifiedAt)continue;const current=galleryMap.get(row.productId)||[];if(!current.some(x=>x.url===url))current.push({url,label:String(row.altText||"").trim(),order:Number(row.sortOrder)||0});galleryMap.set(row.productId,current.sort((a,b)=>a.order-b.order).slice(0,8));}
 const publishable=all.filter(p=>{const gallery=galleryMap.get(p.id)||[];const validPricing=Number(p.sellingPriceInr)>0&&Number(p.mrpInr)>=Number(p.sellingPriceInr);const stockIsValid=Number(p.stockCount)>0;return p.status==="Published"&&Boolean(p.title&&p.sku)&&validPricing&&stockIsValid&&gallery.length>=MIN_IMAGES;});
 let filtered=publishable;if(featured)filtered=filtered.filter(p=>p.aiScore>=92);if(category&&category!=="ALL")filtered=filtered.filter(p=>p.category===category);if(search){const q=search.toLowerCase().trim();filtered=filtered.filter(p=>p.title.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.category.toLowerCase().includes(q));}
 if(sort==="price_low")filtered.sort((a,b)=>Number(a.sellingPriceInr)-Number(b.sellingPriceInr));else if(sort==="price_high")filtered.sort((a,b)=>Number(b.sellingPriceInr)-Number(a.sellingPriceInr));else if(sort==="newest")filtered.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());else if(sort==="popular")filtered.sort((a,b)=>b.salesCount24h-a.salesCount24h);else filtered.sort((a,b)=>b.aiScore-a.aiScore);
 const total=filtered.length;const offset=(page-1)*limit;const paginated=filtered.slice(offset,offset+limit);
 const customerProducts=paginated.map(p=>{const gallery=galleryMap.get(p.id)||[];const imageUrls=gallery.map(x=>x.url).slice(0,8);const imageLabels=imageUrls.map(u=>gallery.find(x=>x.url===u)?.label||"");const d=detailMap.get(p.id);const spec=d?.specificationsJson&&typeof d.specificationsJson==="object"&&!Array.isArray(d.specificationsJson)?d.specificationsJson as Record<string,unknown>:{};const media=spec.media&&typeof spec.media==="object"&&!Array.isArray(spec.media)?spec.media as Record<string,unknown>:{};const productVideos=Array.isArray(media.videos)?media.videos:[];return{id:p.id,sku:p.sku,title:p.title,category:p.category,brand:p.brand,imageUrl:imageUrls[0]||"",imageUrls,imageLabels,productVideos,sellingPriceInr:p.sellingPriceInr,mrpInr:p.mrpInr,stockCount:Number(p.stockCount)||0,aiMarketingCopy:p.aiMarketingCopy,details:d?{description:d.description,specificationsJson:d.specificationsJson,variantsJson:d.variantsJson,includedItems:d.includedItems,dimensions:d.dimensions,weight:d.weight,material:d.material,colorOptions:d.colorOptions,warranty:d.warranty,countryOfOrigin:d.countryOfOrigin,careInstructions:d.careInstructions}:null};});
 const catCounts:Record<string,number>={};publishable.forEach(p=>{catCounts[p.category]=(catCounts[p.category]||0)+1;});
 return NextResponse.json({products:customerProducts,total,page,totalPages:Math.ceil(total/limit),categoryCount:catCounts});
}
