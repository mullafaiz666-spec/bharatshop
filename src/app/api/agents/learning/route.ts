import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiActivityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { openAIJson } from "@/lib/ai/agent-tools";
import { aiConfigured, aiProviderName } from "@/lib/ai/provider";
import { agentPrompt } from "@/lib/agents/contracts";
export const dynamic="force-dynamic";
export async function GET(req:Request){try{const {searchParams}=new URL(req.url);const userId=Number(searchParams.get("userId")??1);const logs=await db.select().from(aiActivityLogs).where(eq(aiActivityLogs.userId,userId)).orderBy(desc(aiActivityLogs.createdAt)).limit(200);const buckets:Record<string,{events:number;profitImpactInr:number}>={};for(const l of logs){const key=l.agentName||"unknown";buckets[key]??={events:0,profitImpactInr:0};buckets[key].events+=1;buckets[key].profitImpactInr+=Number(l.profitImpactInr||0);}let analysis=null;let modelError="";if(logs.length&&aiConfigured()){try{analysis=await openAIJson(agentPrompt("learning"),{observations:buckets,recent:logs.slice(0,50)},{timeoutMs:8000,maxTokens:900});}catch(e){modelError=e instanceof Error?e.message:String(e);}}return NextResponse.json({agent:"Learning-Agent",status:aiConfigured()?"ready":"blocked_missing_local_ai",provider:aiProviderName(),inputs:["source price changes","delivery time","cancellations","returns/RTO","profit","advertising performance"],observations:buckets,analysis,modelError:modelError||undefined,recent:logs.slice(0,30),promptVersion:"agent-suite-v2"});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Learning analysis failed"},{status:503})}}
