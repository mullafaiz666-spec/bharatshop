import { NextResponse } from "next/server";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, or } from "drizzle-orm";
import { resolveVerifiedProductMedia } from "@/lib/ai/media-resolver";

export const dynamic = "force-dynamic";
const BAD=/(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const MIN_CONFIDENCE=0.75;
const VERIFICATION_PROVIDERS=new Set(["local-ai","local-evidence"]);
let maintenanceInFlight:Promise<NextResponse>|null=null;
function qualifies(x:typeof productImages.$inferSelect){return ["AI_VISION_VERIFIED","LOCAL_EVIDENCE_VERIFIED"].includes(String(x.verificationStatus))&&!BAD.test(x.imageUrl)&&/^https:\/\//i.test(x.imageUrl)&&Number(x.verificationConfidence)>=MIN_CONFIDENCE&&VERIFICATION_PROVIDERS.has(String(x.verificationProvider))&&!!x.verifiedAt;}
async function runMaintenance(limit:number){const all=await db.select().from(products).where(or(eq(products.status,"Published"),eq(products.status,"STAGED"),eq(products.status,"CEO_PENDING"))).orderBy(asc(products.id));const imgs=await db.select().from(productImages);const counts=new Map<number,number>();for(const x of imgs)if(qualifies(x))counts.set(x.productId,(counts.get(x.productId)||0)+1);const candidates=all.filter(p=>(counts.get(p.id)||0)<1).slice(0,limit);const results=[];for(const p of candidates)results.push(await resolveVerifiedProductMedia(p.id));return NextResponse.json({status:"COMPLETED",provider:"searxng+local-evidence",processed:candidates.length,resolved:results.filter((r:any)=>r.status==="COMPLETE_MEDIA_RESOLVED").length,blocked:results.filter((r:any)=>r.publicationGate==="BLOCK").length,results,policy:"Standard sourced products need at least one reachable evidence-verified primary image. Made-to-order fashion keeps its stricter multi-image editorial gate in the dedicated fashion/storefront policy."});}
export async function POST(req:Request){try{const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!process.env.BHARATSHOP_AUTOMATION_TOKEN||token!==process.env.BHARATSHOP_AUTOMATION_TOKEN)return NextResponse.json({error:"Unauthorized"},{status:401});const body=await req.json().catch(()=>({}));const limit=Math.max(1,Math.min(10,Number(body.limit||5)));if(maintenanceInFlight)return NextResponse.json({status:"IN_PROGRESS",message:"Catalog image resolution is already running; no overlapping SearXNG/local-evidence job was started."},{status:202});maintenanceInFlight=runMaintenance(limit).finally(()=>{maintenanceInFlight=null;});return await maintenanceInFlight;}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Media resolver failed",publicationGate:"BLOCK"},{status:503});}}
