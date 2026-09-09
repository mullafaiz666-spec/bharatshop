import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, productDetails, products } from "@/db/schema";
import { desc } from "drizzle-orm";

const BAD_IMAGE=/(?:unsplash\.com|source\.unsplash\.com|via\.placeholder\.com|placeholder\.com|placehold\.co|placehold\.it|dummyimage\.com|picsum\.photos|loremflickr\.com|placekitten\.com)/i;
const APPROVED_SOURCE_MEDIA=new Set(["AI_VISION_VERIFIED","LOCAL_EVIDENCE_VERIFIED"]);
const APPROVED_SOURCE_PROVIDERS=new Set(["local-ai","local-evidence"]);
const MIN_IMAGES=4,MIN_CONFIDENCE=0.75;
export const dynamic="force-dynamic";
const cleanUrl=(value:unknown)=>{const url=String(value||"").trim();return /^https:\/\//i.test(url)&&!BAD_IMAGE.test(url)?url:""};
const specsOf=(d:any)=>d?.specificationsJson&&typeof d.specificationsJson==="object"&&!Array.isArray(d.specificationsJson)?d.specificationsJson as Record<string,any>:{};
const madeToOrder=(d:any)=>String(specsOf(d).inventoryMode||"").toUpperCase()==="MADE_TO_ORDER"&&String(specsOf(d).productionSupplier||"").toLowerCase()==="qikink";

export async function GET(req:Request){
 const {searchParams}=new URL(req.url),category=searchParams.get("category")||"",search=searchParams.get("search")||searchParams.get("query")||"",sort=searchParams.get("sort")||"aiScore",limit=Math.min(Math.max(parseInt(searchParams.get("limit")||"24",10)||24,1),192),page=Math.max(parseInt(searchParams.get("page")||"1",10)||1,1),featured=searchParams.get("featured")==="true";
 const [all,imageRows,detailRows]=await Promise.all([db.select().from(products).orderBy(desc(products.aiScore)),db.select().from(productImages),db.select().from(productDetails)]);
 const detailMap=new Map(detailRows.map(x=>[x.productId,x])),galleryMap=new Map<number,{url:string;label:string;order:number}[]>();
 for(const row of imageRows){
  const url=cleanUrl(row.imageUrl);if(!url||!row.verifiedAt)continue;
  const d=detailMap.get(row.productId),s=specsOf(d);
  const sourceBacked=APPROVED_SOURCE_MEDIA.has(String(row.verificationStatus))&&Number(row.verificationConfidence)>=MIN_CONFIDENCE&&APPROVED_SOURCE_PROVIDERS.has(String(row.verificationProvider));
  const originalFashion=String(row.verificationStatus)==="AI_GENERATED_ORIGINAL"&&String(row.verificationProvider)==="bharatshop-studio"&&String(s.designOrigin)==="BharatShop Studio"&&String(s.productionSupplier)==="Qikink"&&madeToOrder(d);
  if(!sourceBacked&&!originalFashion)continue;
  const current=galleryMap.get(row.productId)||[];if(!current.some(x=>x.url===url))current.push({url,label:String(row.altText||"").trim(),order:Number(row.sortOrder)||0});galleryMap.set(row.productId,current.sort((a,b)=>a.order-b.order).slice(0,8));
 }
 const publishable=all.filter(p=>{const gallery=galleryMap.get(p.id)||[],d=detailMap.get(p.id),mto=madeToOrder(d),validPricing=Number(p.sellingPriceInr)>0&&Number(p.mrpInr)>=Number(p.sellingPriceInr),availabilityValid=mto||Number(p.stockCount)>0;return p.status==="Published"&&Boolean(p.title&&p.sku)&&validPricing&&availabilityValid&&gallery.length>=MIN_IMAGES;});
 let filtered=publishable;if(featured)filtered=filtered.filter(p=>p.aiScore>=92);if(category&&category!=="ALL")filtered=filtered.filter(p=>p.category===category);if(search){const q=search.toLowerCase().trim();filtered=filtered.filter(p=>p.title.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||p.supplierName.toLowerCase().includes(q));}
 if(sort==="price_low")filtered.sort((a,b)=>Number(a.sellingPriceInr)-Number(b.sellingPriceInr));else if(sort==="price_high")filtered.sort((a,b)=>Number(b.sellingPriceInr)-Number(a.sellingPriceInr));else if(sort==="newest")filtered.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());else if(sort==="popular")filtered.sort((a,b)=>b.salesCount24h-a.salesCount24h);else filtered.sort((a,b)=>b.aiScore-a.aiScore);
 const total=filtered.length,offset=(page-1)*limit,paginated=filtered.slice(offset,offset+limit);
 const customerProducts=paginated.map(p=>{const gallery=galleryMap.get(p.id)||[],imageUrls=gallery.map(x=>x.url).slice(0,8),imageLabels=imageUrls.map(u=>gallery.find(x=>x.url===u)?.label||""),d=detailMap.get(p.id),spec=specsOf(d),mto=madeToOrder(d),media=spec.media&&typeof spec.media==="object"&&!Array.isArray(spec.media)?spec.media as Record<string,unknown>:{},productVideos=Array.isArray(media.videos)?media.videos:[],sizeOptions=Array.isArray(spec.sizes)?spec.sizes.map(String):[];return{id:p.id,sku:p.sku,title:p.title,category:p.category,brand:p.brand,imageUrl:imageUrls[0]||"",imageUrls,imageLabels,productVideos,sellingPriceInr:p.sellingPriceInr,mrpInr:p.mrpInr,stockCount:Number(p.stockCount)||0,madeToOrder:mto,availabilityMode:mto?"MADE_TO_ORDER":"IN_STOCK",productionSupplier:mto?String(spec.productionSupplier||p.supplierName):p.supplierName,sizeOptions,aiMarketingCopy:p.aiMarketingCopy,details:d?{description:d.description,specificationsJson:d.specificationsJson,variantsJson:d.variantsJson,includedItems:d.includedItems,dimensions:d.dimensions,weight:d.weight,material:d.material,colorOptions:d.colorOptions,warranty:d.warranty,countryOfOrigin:d.countryOfOrigin,careInstructions:d.careInstructions}:null};});
 const catCounts:Record<string,number>={};publishable.forEach(p=>{catCounts[p.category]=(catCounts[p.category]||0)+1;});
 return NextResponse.json({products:customerProducts,total,page,totalPages:Math.ceil(total/limit),categoryCount:catCounts,inventoryPolicy:"Physical supplier items require stock evidence; Qikink fashion is explicitly MADE_TO_ORDER and does not pretend to be held inventory."});
}
