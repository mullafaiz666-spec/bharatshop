import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

const AGENT_MAP: Record<string,string[]> = {
  "AI CEO":["CEO","BHARATSHOP AI CEO"],
  "Product Research":["Source-Discovery-Agent","Product-Research-Agent"],
  "Source Verification":["Verify-Select-AI","Source-Verification-Agent"],
  "Image & Media":["Image-Verification-Agent","Image-Agent"],
  "Fashion Enrichment":["Fashion-Enrichment-Agent","Fashion-Agent"],
  "Listing & Marketing":["Listing-Creative-Agent","Listing-Marketing-Agent"],
  "Learning & Analytics":["Learning-Agent"],
  "Advertising":["Advertising-Agent"],
  "Order Re-check":["Order-Recheck-Agent"],
  "Fulfilment & Tracking":["Fulfilment-Tracking-Agent","Fulfilment-Agent"]
};

async function ensureAuditTable(){
 await pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (
  id SERIAL PRIMARY KEY, agent_name TEXT NOT NULL, event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INFO', summary TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb, approval_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
}

export async function GET(req:Request){
 try{
  await ensureAuditTable();
  const {searchParams}=new URL(req.url); const agent=String(searchParams.get("agent")||"").trim();
  const names=AGENT_MAP[agent]||[];
  const result=names.length
   ? await pool.query(`SELECT agent_name,event_type,status,summary,evidence,approval_id,created_at FROM agent_audit_records WHERE agent_name=ANY($1) ORDER BY created_at DESC LIMIT 50`,[names])
   : await pool.query(`SELECT agent_name,event_type,status,summary,evidence,approval_id,created_at FROM agent_audit_records ORDER BY created_at DESC LIMIT 50`);
  const activity=names.length
   ? await pool.query(`SELECT agent_name,action_type,message,status,profit_impact_inr,metadata_json,created_at FROM ai_activity_logs WHERE agent_name=ANY($1) ORDER BY created_at DESC LIMIT 50`,[names])
   : {rows:[]};
  const blockers=activity.rows.filter((x:any)=>/BLOCK|WARN|FAIL|ERROR/i.test(String(x.status))||/blocked|missing|failed|error|unavailable/i.test(String(x.message)));
  return NextResponse.json({agent:agent||"ALL",records:result.rows,recentActivity:activity.rows,blockers,inspectedAt:new Date().toISOString()});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Agent audit unavailable"},{status:500});}
}

export async function POST(req:Request){
 try{
  await ensureAuditTable(); const body=await req.json();
  const agent=String(body.agentName||"").trim(); if(!agent)return NextResponse.json({error:"agentName required"},{status:400});
  const result=await pool.query(`INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,approval_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[agent,String(body.eventType||"AUDIT"),String(body.status||"INFO"),String(body.summary||""),JSON.stringify(body.evidence||{}),body.approvalId?Number(body.approvalId):null]);
  return NextResponse.json({record:result.rows[0]},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Audit record failed"},{status:500});}
}
