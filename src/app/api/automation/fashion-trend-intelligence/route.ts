import { NextResponse } from "next/server";
import { pool } from "@/db";
import { fashionTrendDirections } from "@/lib/fashion/trend-intelligence";

export const dynamic="force-dynamic";
export const maxDuration=300;

function authorized(req:Request){
  const expected=process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN;
  if(!expected)return false;
  return req.headers.get("authorization")===`Bearer ${expected}`||req.headers.get("x-automation-token")===expected;
}

export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const result=await fashionTrendDirections();
    await pool.query(
      `INSERT INTO ai_activity_logs (user_id,agent_name,action_type,message,metadata_json,status)
       VALUES (1,'Fashion Trend Intelligence','FASHION_TREND_SCAN',$1,$2,$3)`,
      [
        `${result.directions.length} original BharatDrip trend directions prepared from marketplace signals.`,
        JSON.stringify({status:result.status,summary:result.summary,directions:result.directions,signalCount:result.signals.length,errors:result.errors,ipPolicy:result.ipPolicy,digitalBundlePolicy:result.digitalBundlePolicy}),
        result.signals.length?"SUCCESS":"WARNING",
      ],
    );
    return NextResponse.json({success:true,...result,usage:"Fashion designer inspiration only; never import/copy marketplace art or licensed characters."});
  }catch(error){
    return NextResponse.json({success:false,error:error instanceof Error?error.message:"Fashion trend scan failed"},{status:503});
  }
}

export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  const latest=await pool.query(`SELECT created_at,metadata_json,status FROM ai_activity_logs WHERE agent_name='Fashion Trend Intelligence' AND action_type='FASHION_TREND_SCAN' ORDER BY created_at DESC LIMIT 1`);
  return NextResponse.json({agent:"Fashion Trend Intelligence",status:"ready",provider:"SearXNG/marketplace signals + local Gemma + deterministic safe fallback",latest:latest.rows[0]||null,policy:"Trend extraction only. No marketplace art, digital bundles, brands, characters or licensed IP are copied into products."});
}
