import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ceo_approvals (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb, reason TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL DEFAULT 'MEDIUM', status TEXT NOT NULL DEFAULT 'PENDING',
    requested_by TEXT NOT NULL DEFAULT 'BHARATSHOP CEO', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ, decision_note TEXT NOT NULL DEFAULT ''
  )`);
}
async function audit(agent:string,event:string,status:string,summary:string,evidence:any,approvalId:number){
 await pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (id SERIAL PRIMARY KEY,agent_name TEXT NOT NULL,event_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'INFO',summary TEXT NOT NULL DEFAULT '',evidence JSONB NOT NULL DEFAULT '{}'::jsonb,approval_id INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,approval_id) VALUES($1,$2,$3,$4,$5,$6)`,[agent,event,status,summary,JSON.stringify(evidence||{}),approvalId]);
}
export async function GET() {
 try { await ensureTable(); const result=await pool.query(`SELECT id,title,action_type,payload,reason,risk_level,status,requested_by,created_at,decided_at,decision_note FROM ceo_approvals ORDER BY created_at DESC LIMIT 50`); return NextResponse.json({approvals:result.rows}); }
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Approval queue unavailable"},{status:500});}
}
export async function POST(req:Request){
 try{
  await ensureTable(); const body=await req.json(); const action=String(body.action||"");
  if(!["approve","reject"].includes(action))return NextResponse.json({error:"action must be approve or reject"},{status:400});
  const id=Number(body.id); if(!Number.isInteger(id))return NextResponse.json({error:"Valid approval id required"},{status:400});
  const note=String(body.note||(action==="approve"?"Approved by operator":"Rejected by operator"));
  const result=await pool.query(`UPDATE ceo_approvals SET status=$1,decided_at=NOW(),decision_note=$2 WHERE id=$3 AND status='PENDING' RETURNING *`,[action==="approve"?"APPROVED":"REJECTED",note,id]);
  const approval=result.rows[0]; if(!approval)return NextResponse.json({error:"Approval not found or already decided"},{status:409});
  if(action==="reject"){
   await audit(String(approval.requested_by||"AI CEO"),"APPROVAL_REJECTED","REJECTED",`Operator rejected ${approval.action_type}.`,{reason:approval.reason,decisionNote:note},id);
   return NextResponse.json({approval,execution:"BLOCKED"});
  }
  const origin=new URL(req.url).origin;
  const exec=await fetch(`${origin}/api/agent-execute`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionType:approval.action_type,payload:approval.payload,agentName:approval.requested_by,approvalId:id}),cache:"no-store"});
  const raw=await exec.text(); let execution:any; try{execution=JSON.parse(raw)}catch{execution={raw:raw.slice(0,4000)}}
  const succeeded=exec.ok&&execution?.status==="EXECUTED";
  await pool.query(`UPDATE ceo_approvals SET status=$1,decided_at=NOW(),decision_note=$2 WHERE id=$3`,[succeeded?"EXECUTED":"EXECUTION_FAILED",succeeded?`${note}; executed successfully`:`${note}; execution failed`,id]);
  await audit(String(approval.requested_by||"AI CEO"),"APPROVAL_EXECUTION_RESULT",succeeded?"SUCCESS":"FAILED",succeeded?`Approved ${approval.action_type} executed.`:`Approved ${approval.action_type} failed; no success is claimed.`,{approval,execution},id);
  return NextResponse.json({approval:{...approval,status:succeeded?"EXECUTED":"EXECUTION_FAILED"},execution:succeeded?"EXECUTED":"EXECUTION_FAILED",result:execution},{status:succeeded?200:422});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Approval update failed"},{status:500});}
}
