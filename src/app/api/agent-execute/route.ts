import { NextResponse } from "next/server";
import { pool } from "@/db";
export const dynamic="force-dynamic";

const ALLOWED:Record<string,string>={"DISCOVERY":"/api/agents/discovery","SOURCE_VERIFY":"/api/agents/source-verify","LISTING_PUBLISH":"/api/agents/listing","IMAGE_RESOLVE":"/api/catalog/image-resolve","FASHION_ENRICH":"/api/catalog/fashion-enrich","FASHION_STUDIO":"/api/fashion-studio","ADVERTISING":"/api/agents/advertising","ORDER_RECHECK":"/api/agents/recheck","TRACKING":"/api/agents/tracking"};
async function audit(agent:string,event:string,status:string,summary:string,evidence:any,approvalId?:number){await pool.query(`CREATE TABLE IF NOT EXISTS agent_audit_records (id SERIAL PRIMARY KEY,agent_name TEXT NOT NULL,event_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'INFO',summary TEXT NOT NULL DEFAULT '',evidence JSONB NOT NULL DEFAULT '{}'::jsonb,approval_id INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await pool.query(`INSERT INTO agent_audit_records(agent_name,event_type,status,summary,evidence,approval_id) VALUES($1,$2,$3,$4,$5,$6)`,[agent,event,status,summary,JSON.stringify(evidence||{}),approvalId||null]);}
export async function POST(req:Request){
 try{
  const body=await req.json(); const action=String(body.actionType||"").toUpperCase(); const path=ALLOWED[action];
  if(!path)return NextResponse.json({error:`Action ${action} is not approved for execution`},{status:400});
  const agent=String(body.agentName||action); const approvalId=Number(body.approvalId);
  if(!Number.isInteger(approvalId)||approvalId<=0)return NextResponse.json({error:"Consequential actions require a valid approved approvalId",code:"APPROVAL_REQUIRED"},{status:403});
  const approvalResult=await pool.query(`SELECT id,action_type,payload,status,requested_by FROM ceo_approvals WHERE id=$1 LIMIT 1`,[approvalId]);
  const approval=approvalResult.rows[0];
  if(!approval)return NextResponse.json({error:"Approval record not found",code:"APPROVAL_NOT_FOUND"},{status:409});
  if(String(approval.status)!=="APPROVED")return NextResponse.json({error:`Approval ${approvalId} is not executable; status=${approval.status}`,code:"APPROVAL_NOT_GRANTED"},{status:409});
  if(String(approval.action_type).toUpperCase()!==action)return NextResponse.json({error:"Approval action type does not match requested action",code:"APPROVAL_ACTION_MISMATCH"},{status:409});
  // The approved database payload is authoritative; callers cannot mutate an
  // approved action by supplying a different payload alongside the approval id.
  const payload=approval.payload&&typeof approval.payload==="object"?approval.payload:{};
  if(action==="IMAGE_RESOLVE"||action==="FASHION_STUDIO"){const token=process.env.BHARATSHOP_AUTOMATION_TOKEN;if(!token)return NextResponse.json({error:"Automation token is not configured"},{status:503});}
  const origin=new URL(req.url).origin; const headers:any={"Content-Type":"application/json"}; if(action==="IMAGE_RESOLVE"||action==="FASHION_STUDIO")headers.authorization=`Bearer ${process.env.BHARATSHOP_AUTOMATION_TOKEN}`;
  const response=await fetch(`${origin}${path}`,{method:"POST",headers,body:JSON.stringify(payload),cache:"no-store"}); const raw=await response.text(); let data:any; try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,4000)}}
  const ok=response.ok&&!data?.error&&!['BLOCKED','NO_QUALIFIED_SOURCE','NO_QUALIFIED_PRODUCT'].includes(String(data?.status));
  await audit(agent,"ACTION_EXECUTION",ok?"SUCCESS":"FAILED",ok?`Approved ${action} executed successfully.`:`Approved ${action} returned a failure or blocked result.`,{action,payload,result:data,httpStatus:response.status,approvalStatus:approval.status},approvalId);
  return NextResponse.json({status:ok?"EXECUTED":"EXECUTION_FAILED",action,result:data},{status:ok?200:422});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Execution failed"},{status:500});}
}
