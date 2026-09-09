import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, productDetails, products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { criticalCoverageCounts } from "@/lib/catalog/priority-coverage";

const BAD_IMAGE=/(?:unsplash\.com|source\.unsplash\.com|via\.placeholder\.com|placeholder\.com|placehold\.co|placehold\.it|dummyimage\.com|picsum\.photos|loremflickr\.com|placekitten\.com)/i;
const LOCAL_HOST=/^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i;
const INTERNAL_VENDOR=/(?:qikink|deodap|supplier|source url|wholesale|dropship|margin|net profit|commission|rate card|procurement|fulfil(?:l)?ment partner|production partner)/i;
const APPROVED_SOURCE_MEDIA=new Set(["AI_VISION_VERIFIED","LOCAL_EVIDENCE_VERIFIED"]);
const APPROVED_SOURCE_PROVIDERS=new Set(["local-ai","local-evidence"]);
const APPROVED_EDITORIAL_PROVIDERS=new Set(["hf-zerogpu","hf-zerogpu-custom","hf-zerogpu-flux1-schnell","hf-zerogpu-zimage-turbo"]);
const MTO_FASHION_BRANDS=new Set(["bharatshop studio","bharatdrip"]);
const FASHION_EDITORIAL_STYLE="drip-realworld-v4";
const MIN_STANDARD_IMAGES=Math.max(1,Number(process.env.MIN_STANDARD_PRODUCT_IMAGES||1));
const MIN_FASHION_IMAGES=Math.max(4,Number(process.env.MIN_FASHION_PRODUCT_IMAGES||4));
const MIN_CONFIDENCE=.75;
export const dynamic="force-dynamic";

const specsOf=(d:any)=>d?.specificationsJson&&typeof d.specificationsJson==="object"&&!Array.isArray(d.specificationsJson)?d.specificationsJson as Record<string,any>:{};
const fashionOrigin=(d:any)=>String(specsOf(d).designOrigin||"").trim();
const madeToOrder=(d:any)=>{const s=specsOf(d),origin=fashionOrigin(d).toLowerCase();return MTO_FASHION_BRANDS.has(origin)&&String(s.inventoryMode||"").toUpperCase()==="MADE_TO_ORDER"&&String(s.productionSupplier||"").toLowerCase()==="qikink"&&Boolean(String(s.qikinkProductCode||"").trim());};

function publicOrigin(req:Request){for(const value of [process.env.PUBLIC_APP_URL,process.env.NEXT_PUBLIC_SITE_URL,process.env.RENDER_EXTERNAL_URL,new URL(req.url).origin,"https://bharatshop-9w4a.onrender.com"]){try{if(!value)continue;const u=new URL(value);if(u.protocol==="https:"&&!LOCAL_HOST.test(u.hostname))return u.origin;}catch{}}return"https://bharatshop-9w4a.onrender.com";}
function cleanUrl(value:unknown,origin:string){let raw=String(value||"").trim();if(!raw||BAD_IMAGE.test(raw))return"";try{const u=new URL(raw);if(LOCAL_HOST.test(u.hostname)&&(u.pathname.startsWith("/api/fashion-art/")||u.pathname.startsWith("/api/fashion-photo/")))raw=`${origin}${u.pathname}${u.search}`;}catch{return"";}return/^https:\/\//i.test(raw)&&!BAD_IMAGE.test(raw)?raw:"";}
function customerText(value:unknown){return String(value||"").split(/(?<=[.!?])\s+/).filter(sentence=>!INTERNAL_VENDOR.test(sentence)).join(" ").replace(/\b(?:Qikink|DeoDap)\b/gi,"").replace(/\s{2,}/g," ").trim();}

export async function GET(req:Request){
  const{searchParams}=new URL(req.url),origin=publicOrigin(req),category=searchParams.get("category")||"",search=searchParams.get("search")||searchParams.get("query")||"",sort=searchParams.get("sort")||"aiScore",limit=Math.min(Math.max(parseInt(searchParams.get("limit")||"24",10)||24,1),96),page=Math.max(parseInt(searchParams.get("page")||"1",10)||1,1),featured=searchParams.get("featured")==="true",requestedId=Math.max(parseInt(searchParams.get("id")||"0",10)||0,0);
  const[all,imageRows,detailRows]=await Promise.all([db.select().from(products).orderBy(desc(products.aiScore)),db.select().from(productImages),db.select().from(productDetails)]);
  const detailMap=new Map(detailRows.map(x=>[x.productId,x]));
  const galleryMap=new Map<number,{url:string;label:string;order:number;editorial:boolean;currentEditorial:boolean}[]>();

  for(const row of imageRows){
    const d=detailMap.get(row.productId),s=specsOf(d),view=Math.max(0,Math.min(3,Number(row.sortOrder)||0)),mto=madeToOrder(d);
    const oldLocalEditorial=String(row.verificationStatus)==="AI_GENERATED_EDITORIAL"&&String(row.verificationProvider)==="bharatshop-local-raster"&&mto;
    const rawImage=oldLocalEditorial?`${origin}/api/fashion-art/${row.productId}/${view}?style=${FASHION_EDITORIAL_STYLE}&fallback=product-mockup`:row.imageUrl;
    const image=cleanUrl(rawImage,origin);if(!image||!row.verifiedAt)continue;
    const sourceBacked=APPROVED_SOURCE_MEDIA.has(String(row.verificationStatus))&&Number(row.verificationConfidence)>=MIN_CONFIDENCE&&APPROVED_SOURCE_PROVIDERS.has(String(row.verificationProvider));
    const originalFashion=((String(row.verificationStatus)==="AI_GENERATED_ORIGINAL"&&String(row.verificationProvider)==="bharatshop-studio")||oldLocalEditorial)&&MTO_FASHION_BRANDS.has(fashionOrigin(d).toLowerCase())&&String(s.productionSupplier||"").toLowerCase()==="qikink"&&mto;
    const editorialFashion=String(row.verificationStatus)==="AI_GENERATED_EDITORIAL"&&APPROVED_EDITORIAL_PROVIDERS.has(String(row.verificationProvider))&&mto;
    const currentEditorial=editorialFashion&&String(rawImage||"").includes(`style=${FASHION_EDITORIAL_STYLE}`);
    if(!sourceBacked&&!originalFashion&&!editorialFashion)continue;
    const current=galleryMap.get(row.productId)||[];
    if(!current.some(x=>x.url===image))current.push({url:image,label:customerText(row.altText),order:Number(row.sortOrder)||0,editorial:editorialFashion,currentEditorial});
    galleryMap.set(row.productId,current.sort((a,b)=>Number(b.currentEditorial)-Number(a.currentEditorial)||Number(b.editorial)-Number(a.editorial)||a.order-b.order).slice(0,8));
  }

  const publishable=all.filter(p=>{
    const gallery=galleryMap.get(p.id)||[],d=detailMap.get(p.id),mto=madeToOrder(d),validPricing=Number(p.sellingPriceInr)>0&&Number(p.mrpInr)>=Number(p.sellingPriceInr),availabilityValid=mto||Number(p.stockCount)>0;
    const mediaReady=mto?gallery.length>=MIN_FASHION_IMAGES:gallery.length>=MIN_STANDARD_IMAGES;
    return p.status==="Published"&&Boolean(p.title)&&validPricing&&availabilityValid&&mediaReady;
  });
  const criticalCoverage=criticalCoverageCounts(publishable,p=>({title:p.title,category:p.category,brand:p.brand,madeToOrder:madeToOrder(detailMap.get(p.id))}));
  let filtered=publishable;
  if(requestedId)filtered=filtered.filter(p=>p.id===requestedId);
  if(featured)filtered=filtered.filter(p=>p.aiScore>=92);
  if(category&&category!=="ALL")filtered=filtered.filter(p=>p.category===category);
  if(search){const q=search.toLowerCase().trim();filtered=filtered.filter(p=>p.title.toLowerCase().includes(q)||p.category.toLowerCase().includes(q));}
  if(sort==="price_low")filtered.sort((a,b)=>Number(a.sellingPriceInr)-Number(b.sellingPriceInr));else if(sort==="price_high")filtered.sort((a,b)=>Number(b.sellingPriceInr)-Number(a.sellingPriceInr));else if(sort==="newest")filtered.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());else if(sort==="popular")filtered.sort((a,b)=>b.salesCount24h-a.salesCount24h);else filtered.sort((a,b)=>b.aiScore-a.aiScore);

  const total=filtered.length,offset=(page-1)*limit,paginated=filtered.slice(offset,offset+limit);
  const customerProducts=paginated.map(p=>{
    const gallery=galleryMap.get(p.id)||[],d=detailMap.get(p.id),spec=specsOf(d),mto=madeToOrder(d),fashionBrand=fashionOrigin(d),publicBrand=mto?(MTO_FASHION_BRANDS.has(fashionBrand.toLowerCase())?fashionBrand:"BharatShop Studio"):"BharatShop Select";
    const derivedFashion=mto?Array.from({length:4},(_,i)=>`${origin}/api/fashion-art/${p.id}/${i}?style=${FASHION_EDITORIAL_STYLE}&fallback=product-mockup`):[];
    const preferred=mto?[...gallery.filter(x=>x.currentEditorial),...gallery.filter(x=>x.editorial&&!x.currentEditorial),...gallery.filter(x=>!x.editorial)]:gallery;
    const combined=mto?[...preferred.map(x=>x.url),...derivedFashion]:preferred.map(x=>x.url),imageUrls=Array.from(new Set(combined)).slice(0,8);
    const imageLabels=imageUrls.map((u,i)=>gallery.find(x=>x.url===u)?.label||(["Editorial / product view","Design detail","Back view","Colour palette"][i]||"Product view"));
    const media=spec.media&&typeof spec.media==="object"&&!Array.isArray(spec.media)?spec.media as Record<string,unknown>:{},productVideos=Array.isArray(media.videos)?media.videos.filter(v=>typeof v==="string"&&/^https:\/\//i.test(v as string)&&!INTERNAL_VENDOR.test(v as string)&&!/(?:0\.0\.0\.0|localhost|127\.0\.0\.1)/i.test(v as string)):[],sizeOptions=Array.isArray(spec.sizes)?spec.sizes.map(String).map(customerText).filter(Boolean):[];
    const editorialStyleState=mto?(gallery.some(x=>x.currentEditorial)?"PHOTOREAL_CURRENT":"PHOTOREAL_UPGRADE_PENDING"):undefined;
    return{id:p.id,sku:`BS-${p.id}`,title:customerText(p.title)||p.title,category:customerText(p.category)||p.category,brand:publicBrand,storefrontLabel:publicBrand,imageUrl:imageUrls[0]||"",imageUrls,imageLabels,productVideos,sellingPriceInr:p.sellingPriceInr,mrpInr:p.mrpInr,stockCount:Number(p.stockCount)||0,madeToOrder:mto,availabilityMode:mto?"MADE_TO_ORDER":"IN_STOCK",sizeOptions,editorialStyleState,aiMarketingCopy:customerText(p.aiMarketingCopy),details:d?{description:customerText(d.description),includedItems:customerText(d.includedItems),dimensions:customerText(d.dimensions),weight:customerText(d.weight),material:customerText(d.material),colorOptions:customerText(d.colorOptions),warranty:customerText(d.warranty),countryOfOrigin:customerText(d.countryOfOrigin),careInstructions:customerText(d.careInstructions)}:null};
  });
  const catCounts:Record<string,number>={};publishable.forEach(p=>{const c=customerText(p.category)||"Other";catCounts[c]=(catCounts[c]||0)+1;});
  return NextResponse.json({products:customerProducts,total,page,totalPages:Math.max(1,Math.ceil(total/limit)),categoryCount:catCounts,criticalCoverage,privacy:"customer-safe-v7",availabilityPolicy:"Standard sourced products need verified primary media. Made-to-order BharatShop Studio/BharatDrip products are visible after four verified original design views; photoreal editorial imagery is an upgrade, not a visibility prerequisite.",fashionEditorialStyle:FASHION_EDITORIAL_STYLE},{headers:{"Cache-Control":"no-store"}});
}
