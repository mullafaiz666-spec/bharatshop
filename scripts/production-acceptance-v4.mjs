#!/usr/bin/env node

const BASE=(process.env.BHARATSHOP_URL||process.env.BASE_URL||"https://bharatshop-9w4a.onrender.com").replace(/\/$/,"");
const TOKEN=process.env.BHARATSHOP_AUTOMATION_TOKEN||"";
const APPROVAL_TOKEN=process.env.BHARATSHOP_OPERATOR_APPROVAL_TOKEN||"";
const gates=[];
const gate=(name,status,detail)=>{gates.push({name,status,detail});console.log(`${status.padEnd(6)} ${name}  ${detail}`);};

async function req(path,options={}){
  const headers={...(options.headers||{})};
  if(TOKEN&&!Object.keys(headers).some(k=>k.toLowerCase()==="authorization")) headers.Authorization=`Bearer ${TOKEN}`;
  if(TOKEN&&!Object.keys(headers).some(k=>k.toLowerCase()==="x-automation-token")) headers["x-automation-token"]=TOKEN;
  const r=await fetch(`${BASE}${path}`,{...options,headers,signal:AbortSignal.timeout(options.timeoutMs||120000)});
  const text=await r.text();
  let data; try{data=JSON.parse(text);}catch{data={raw:text.slice(0,4000)};}
  return {r,data};
}

const bool=x=>x===true;

async function main(){
  console.log(`Production acceptance target: ${BASE}`);

  let deep=null;
  try{
    const h=await req("/api/health");
    gate("GATE 1 Render",h.r.status===200?"PASS":"FAIL",`HTTP ${h.r.status}; revision=${h.data?.revision||"missing"}`);
  }catch(e){gate("GATE 1 Render","FAIL",String(e));}

  try{
    deep=await req("/api/health?deep=1",{timeoutMs:120000});
    const p=bool(deep.data?.readiness?.postgres?.ready);
    const a=bool(deep.data?.readiness?.ai?.ready);
    const v=bool(deep.data?.readiness?.vision?.ready);
    const s=bool(deep.data?.readiness?.searxng?.ready);
    gate("GATE 2 Deep providers",deep.r.status===200&&p&&a&&v&&s?"PASS":"FAIL",`HTTP ${deep.r.status}; postgres=${p}, ai=${a}, vision=${v}, searxng=${s}`);
  }catch(e){gate("GATE 2 Deep providers","FAIL",String(e));}

  let storefront=[];
  try{
    const s=await req("/api/storefront/products?limit=96");
    storefront=Array.isArray(s.data?.products)?s.data.products:[];
    const unsafe=storefront.filter(p=>!Array.isArray(p.imageUrls)||p.imageUrls.length<4||p.imageUrls.some(u=>!/^https:\/\//i.test(String(u||"")))||Number(p.sellingPriceInr)<=0||(!p.madeToOrder&&Number(p.stockCount)<=0));
    const leakedKeys=["supplierName","supplierCity","supplierCostInr","supplierProductUrl","sourceUrl","sourceProductUrl","productionSupplier","procurementUrl","netProfitInr","profitMarginPct","commissionInr"];
    const publicBrands=new Set(["BharatShop Select","BharatShop Studio","BharatDrip"]);
    const privacyLeaks=storefront.filter(p=>leakedKeys.some(k=>Object.prototype.hasOwnProperty.call(p,k))||!publicBrands.has(String(p.brand||""))||/(?:deodap|qikink)/i.test(JSON.stringify(p)));
    const categoryCounts=s.data?.categoryCount&&typeof s.data.categoryCount==="object"?s.data.categoryCount:{};
    const badCategories=Object.entries(categoryCounts).filter(([,count])=>Number(count)<=0);

    gate("GATE 3 Storefront/PostgreSQL",s.r.status===200&&storefront.length>=4&&unsafe.length===0?"PASS":"FAIL",`HTTP ${s.r.status}; published=${storefront.length}; unsafe=${unsafe.length}`);
    gate("GATE 4 Storefront privacy",privacyLeaks.length===0?"PASS":"FAIL",`vendor/internal leaks=${privacyLeaks.length}; privacy=${s.data?.privacy||"missing"}`);
    gate("GATE 5 Category integrity",badCategories.length===0?"PASS":"FAIL",`categories=${Object.keys(categoryCounts).length}; invalid=${badCategories.length}`);

    const sample=storefront.find(p=>Array.isArray(p.imageUrls)&&p.imageUrls[0])?.imageUrls?.[0];
    if(!sample){
      gate("GATE 6 Storefront media live","FAIL","no published product image available");
    }else{
      const art=await fetch(sample,{signal:AbortSignal.timeout(30000)});
      const ct=(art.headers.get("content-type")||"").split(";")[0];
      const bytes=art.ok?(await art.arrayBuffer()).byteLength:0;
      const ok=art.ok&&/^image\/(?:png|jpeg|webp|avif)$/i.test(ct)&&bytes>2000;
      gate("GATE 6 Storefront media live",ok?"PASS":"FAIL",`HTTP ${art.status}; type=${ct}; bytes=${bytes}; ${sample}`);
    }
  }catch(e){
    gate("GATE 3 Storefront/PostgreSQL","FAIL",String(e));
    gate("GATE 4 Storefront privacy","FAIL",String(e));
    gate("GATE 5 Category integrity","FAIL",String(e));
    gate("GATE 6 Storefront media live","FAIL",String(e));
  }

  gate("GATE 7 Automation auth",TOKEN?"PASS":"FAIL",TOKEN?"automation token supplied to CI":"BHARATSHOP_AUTOMATION_TOKEN missing");

  try{const r=await req("/api/automation/source-verify");gate("GATE 8 Source verifier",r.r.status===200&&r.data?.status==="ready"?"PASS":"FAIL",`HTTP ${r.r.status}; status=${r.data?.status}`);}catch(e){gate("GATE 8 Source verifier","FAIL",String(e));}
  try{const r=await req("/api/automation/product-enrich");gate("GATE 9 Product enrichment",r.r.status===200&&r.data?.status==="ready"?"PASS":"FAIL",`HTTP ${r.r.status}; status=${r.data?.status}`);}catch(e){gate("GATE 9 Product enrichment","FAIL",String(e));}

  try{
    if(!deep) deep=await req("/api/health?deep=1",{timeoutMs:120000});
    const modelReady=bool(deep.data?.readiness?.ai?.modelReady);
    const provider=deep.data?.readiness?.ai?.provider||"unknown";
    const reason=deep.data?.readiness?.ai?.reason||"unknown";
    gate("GATE 10 Local Gemma inference",deep.r.status===200&&modelReady?"PASS":"FAIL",`HTTP ${deep.r.status}; modelReady=${modelReady}; provider=${provider}; reason=${reason}`);
  }catch(e){gate("GATE 10 Local Gemma inference","FAIL",String(e));}

  try{const r=await req("/api/agents/listing");gate("GATE 11 Listing agent",r.r.status===200&&String(r.data?.status||"").startsWith("ready")?"PASS":"FAIL",`HTTP ${r.r.status}; status=${r.data?.status}; provider=${r.data?.provider}`);}catch(e){gate("GATE 11 Listing agent","FAIL",String(e));}

  let ceo=null;
  try{
    ceo=await req("/api/ceo-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"What is actually live right now, what is the biggest problem, and what should you do next?",context:{selectedAgent:"AI CEO"}}),timeoutMs:120000});
    const trace=Array.isArray(ceo.data?.toolExecutions)?ceo.data.toolExecutions:[];
    const reply=String(ceo.data?.reply||"");
    const botlike=/(audited tool execution|deterministic summary|live evidence inspection completed|human fallback)/i.test(reply);
    gate("GATE 12 CEO model response",ceo.r.status===200&&ceo.data?.mode==="ai-agent-live"&&ceo.data?.modelStatus==="live"&&reply.trim()&&!botlike?"PASS":"FAIL",`HTTP ${ceo.r.status}; mode=${ceo.data?.mode}; modelStatus=${ceo.data?.modelStatus}; botlike=${botlike}`);
    gate("GATE 13 CEO tool observations",trace.length>0&&trace.every(x=>x.result!==undefined&&x.status!=="AUDIT_FAILED")?"PASS":"FAIL",`completed=${trace.filter(x=>x.result!==undefined&&x.status!=="AUDIT_FAILED").length}/${trace.length}`);
  }catch(e){gate("GATE 12 CEO model response","FAIL",String(e));gate("GATE 13 CEO tool observations","FAIL",String(e));}

  try{
    const a=await req("/api/agent-audit");
    const records=Array.isArray(a.data?.records)?a.data.records:[];
    gate("GATE 14 Audit persistence",a.r.status===200&&records.some(x=>x.event_type==="TOOL_EXECUTION")&&records.some(x=>x.event_type==="CEO_DECISION")?"PASS":"FAIL",`HTTP ${a.r.status}; records=${records.length}`);
  }catch(e){gate("GATE 14 Audit persistence","FAIL",String(e));}

  let approvalId=null;
  try{
    const title=`Production acceptance IMAGE_RESOLVE ${Date.now()}`;
    const ask=await req("/api/ceo-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:`Create a low-risk human approval request titled exactly "${title}" for IMAGE_RESOLVE with payload {"limit":1}. Do not execute it.`,context:{selectedAgent:"AI CEO"}}),timeoutMs:120000});
    const q=await req("/api/ceo-approvals");
    const pending=(q.data?.approvals||[]).find(x=>x.title===title&&x.status==="PENDING"&&String(x.action_type).toUpperCase()==="IMAGE_RESOLVE");
    approvalId=pending?.id??null;
    gate("GATE 15 CEO approval request",ask.r.status===200&&approvalId?"PASS":"FAIL",`HTTP ${ask.r.status}; approvalId=${approvalId??"missing"}`);

    const blocked=await req("/api/agent-execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionType:"IMAGE_RESOLVE",payload:{limit:1},agentName:"Production Acceptance"})});
    gate("GATE 16 Pre-approval block",blocked.r.status===403&&String(blocked.data?.code)==="APPROVAL_REQUIRED"?"PASS":"FAIL",`HTTP ${blocked.r.status}; code=${blocked.data?.code}`);
  }catch(e){gate("GATE 15 CEO approval request","FAIL",String(e));gate("GATE 16 Pre-approval block","FAIL",String(e));}

  if(!approvalId){
    gate("GATE 17 Human approval","MANUAL","No pending approval to exercise");
    gate("GATE 18 One-time execution","MANUAL","No pending approval to exercise");
  }else if(!APPROVAL_TOKEN){
    gate("GATE 17 Human approval","MANUAL",`Pending approval ${approvalId} requires a human operator; CI intentionally does not self-approve`);
    gate("GATE 18 One-time execution","MANUAL","Execution intentionally remains blocked until human approval");
  }else{
    try{
      const approved=await req("/api/ceo-approvals",{method:"POST",headers:{"Content-Type":"application/json","x-operator-approval-token":APPROVAL_TOKEN},body:JSON.stringify({action:"approve",id:approvalId,note:"Human operator approved production acceptance action."})});
      gate("GATE 17 Human approval",approved.r.status===200&&approved.data?.execution==="EXECUTED"?"PASS":"FAIL",`HTTP ${approved.r.status}; execution=${approved.data?.execution}`);
      const replay=await req("/api/agent-execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionType:"IMAGE_RESOLVE",approvalId,agentName:"Replay Test"})});
      gate("GATE 18 One-time execution",[409,403].includes(replay.r.status)?"PASS":"FAIL",`replay HTTP ${replay.r.status}; code=${replay.data?.code}`);
    }catch(e){gate("GATE 17 Human approval","FAIL",String(e));gate("GATE 18 One-time execution","FAIL",String(e));}
  }

  const failed=gates.filter(x=>x.status==="FAIL");
  const manual=gates.filter(x=>x.status==="MANUAL");
  console.log(`\nPRODUCTION ACCEPTANCE: ${failed.length?"FAIL":"PASS"} (${manual.length} manual gate(s))`);
  if(failed.length){for(const x of failed)console.log(`- ${x.name}: ${x.detail}`);process.exit(1);}
}

main().catch(e=>{console.error(e);process.exit(1);});
