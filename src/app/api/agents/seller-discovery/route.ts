import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { sellerLeads } from "@/db/schema";

const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir"];

function score(text:string, category:string){
 const t=text.toLowerCase(), c=category.toLowerCase();
 const trend=(/streetwear|gen ?z|handmade|ethnic|sustainable|oversized|sneaker|jewellery|beauty|accessories|home decor/.test(t)?25:12);
 const unique=(/brand|studio|designer|artisan|handcrafted|original|independent|label/.test(t)?25:10);
 const categoryFit=(t.includes(c)||c.split(/\s+/).some(w=>w.length>3&&t.includes(w))?25:12);
 return Math.min(100,trend+unique+categoryFit+25);
}

async function discover(state:string, city:string, category:string){
 const key=process.env.SERPAPI_API_KEY;
 if(!key) return {configured:false,results:[],message:"SERPAPI_API_KEY is not configured; no live seller claims were made."};
 const q=`${category} ${city} ${state} Indian brand seller independent store contact`;
 const url=`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&location=${encodeURIComponent(city+", "+state+", India")}&num=10&api_key=${encodeURIComponent(key)}`;
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok) throw new Error(`Seller research returned HTTP ${r.status}`);
 const j=await r.json();
 const results=(j.organic_results||[]).slice(0,10).map((x:any)=>{const text=`${x.title||""} ${x.snippet||""}`;const s=score(text,category);return {sellerName:x.title||"Potential seller",brandName:x.title||"",city,state,category,sourceUrl:x.link||"",contactUrl:x.link||"",evidence:x.snippet||"",opportunityScore:s,trendFitScore:Math.min(100,s+(/trend|popular|viral|new|collection/i.test(text)?8:0)),uniquenessScore:Math.min(100,s+(/brand|studio|designer|artisan|independent|label/i.test(text)?8:0))};});
 return {configured:true,results};
}

export async function GET(req:Request){
 try{const u=new URL(req.url);const state=u.searchParams.get("state")||"Maharashtra";const city=u.searchParams.get("city")||"Mumbai";const category=u.searchParams.get("category")||"GenZ fashion";const rows=await db.select().from(sellerLeads).orderBy(desc(sellerLeads.opportunityScore),desc(sellerLeads.createdAt)).limit(50);return NextResponse.json({states:STATES,filters:{state,city,category},leads:rows});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to load seller intelligence"},{status:503});}}

export async function POST(req:Request){
 try{const b=await req.json().catch(()=>({}));const state=String(b.state||"Maharashtra").trim();const city=String(b.city||"Mumbai").trim();const category=String(b.category||"GenZ fashion").trim();if(!state||!city||!category)return NextResponse.json({error:"State, city and category are required"},{status:400});const found=await discover(state,city,category);if(!found.configured)return NextResponse.json(found,{status:503});let saved=0;for(const x of found.results){await db.insert(sellerLeads).values(x).onConflictDoNothing();saved++;}return NextResponse.json({ok:true,market:{state,city,category},discovered:found.results.length,saved,leads:found.results});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Seller discovery failed"},{status:503});}}
