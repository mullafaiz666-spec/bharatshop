#!/usr/bin/env node
const BASE_URL = String(process.env.BHARATSHOP_URL || process.env.BASE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");
const TOKEN = process.env.BHARATSHOP_AUTOMATION_TOKEN || "";
const gates = [];
const gate = (name, ok, detail) => { gates.push({name, ok:!!ok, detail}); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };
async function req(path, options={}) {
  const r = await fetch(`${BASE_URL}${path}`, {...options, signal: AbortSignal.timeout(60000)});
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = {raw:text.slice(0,4000)}; }
  return {r,data};
}
function publishedRows(data) {
  return Array.isArray(data?.products) ? data.products.filter(p => p && Number.isInteger(Number(p.id)) && p.title && p.sku && Array.isArray(p.imageUrls)) : [];
}
async function imageReachability(urls) {
  const results = [];
  for (const url of [...new Set(urls)].slice(0,32)) {
    try {
      const r = await fetch(url, {method:"GET", redirect:"follow", signal:AbortSignal.timeout(15000), headers:{"User-Agent":"BharatShop-Production-Acceptance/1.0"}});
      results.push({url, ok:r.ok, status:r.status, type:r.headers.get("content-type")||""});
    } catch(e) { results.push({url, ok:false, status:0, error:e instanceof Error?e.message:String(e)}); }
  }
  return results;
}
async function main() {
  console.log(`Production acceptance target: ${BASE_URL}`);
  let health;
  try { health = await req("/api/health"); gate("GATE 1 Render", health.r.status===200, `HTTP ${health.r.status}`); gate("GATE 2 Health", health.r.status===200 && health.data?.ok===true && health.data?.readiness?.postgres?.ready===true && health.data?.readiness?.openai?.ready===true && health.data?.readiness?.anthropic?.ready===true, `HTTP ${health.r.status}, postgres=${!!health.data?.readiness?.postgres?.ready}, openai=${!!health.data?.readiness?.openai?.ready}, anthropic=${!!health.data?.readiness?.anthropic?.ready}`); } catch(e) { gate("GATE 1 Render",false,String(e)); gate("GATE 2 Health",false,"unavailable"); }

  let products;
  try {
    products = await req("/api/storefront/products?limit=24");
    const rows = publishedRows(products.data);
    const candidate = rows.find(p => p.imageUrls.filter(u=>/^https:\/\//i.test(String(u))).length >= 4);
    gate("GATE 3 Storefront", products.r.status===200 && rows.length>0 && !!candidate, `HTTP ${products.r.status}, products=${rows.length}, qualifying>=4=${candidate?1:0}`);
    const urls = candidate ? [candidate.imageUrl, ...candidate.imageUrls].filter(Boolean).map(String) : [];
    const reach = await imageReachability(urls);
    gate("GATE 4 HTTPS images", !!candidate && reach.length>=4 && reach.every(x=>x.ok && /^image\//i.test(x.type)), `product=${candidate?.id??"none"}, tested=${reach.length}, reachable=${reach.filter(x=>x.ok).length}`);
  } catch(e) { gate("GATE 3 Storefront",false,String(e)); gate("GATE 4 HTTPS images",false,"storefront unavailable"); }

  let resolver = null;
  if (!TOKEN) { gate("GATE 5 Image resolver",false,"BHARATSHOP_AUTOMATION_TOKEN missing"); }
  else {
    try {
      resolver = await req("/api/catalog/image-resolve", {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${TOKEN}`},body:JSON.stringify({limit:2})});
      const results = Array.isArray(resolver.data?.results) ? resolver.data.results : [];
      const success = resolver.r.status===200 && resolver.data?.status==="COMPLETED" && results.some(x=>x.status==="COMPLETE_MEDIA_RESOLVED");
      const best = results.find(x=>x.status==="COMPLETE_MEDIA_RESOLVED" && Number(x.imageCount)>=4);
      gate("GATE 5 SearXNG → Claude", success && !!best, `HTTP ${resolver.r.status}, processed=${results.length}, resolved>=4=${best?1:0}, provider=${best?.provider??"?"}`);
      gate("GATE 6 Verified images >=4", !!best && Number(best.imageCount)>=4 && Array.isArray(best.images) && best.images.filter(x=>/^https:\/\//i.test(String(x?.url||""))).length>=4, `verified=${best?.imageCount??0}`);
      gate("GATE 7 PostgreSQL/PUBLISHED", !!best && best.publicationGate==="PASS" && best.status==="COMPLETE_MEDIA_RESOLVED", `product=${best?.productId??"none"}, publicationGate=${best?.publicationGate??"?"}`);
      const after = await req("/api/storefront/products?limit=24");
      const rows = publishedRows(after.data); const p = best ? rows.find(x=>Number(x.id)===Number(best.productId)) : rows.find(x=>x.imageUrls.filter(u=>/^https:\/\//i.test(String(u))).length>=4);
      gate("GATE 8 Storefront persisted media", after.r.status===200 && !!p && p.imageUrls.filter(u=>/^https:\/\//i.test(String(u))).length>=4, `HTTP ${after.r.status}, product=${p?.id??"none"}, images=${p?.imageUrls?.length??0}`);
    } catch(e) { gate("GATE 5 SearXNG → Claude",false,String(e)); gate("GATE 6 Verified images >=4",false,"resolver failed"); gate("GATE 7 PostgreSQL/PUBLISHED",false,"resolver failed"); gate("GATE 8 Storefront persisted media",false,"resolver failed"); }
  }

  let ceo;
  try {
    ceo = await req("/api/ceo-chat", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"Inspect the live catalogue and verify its current health using your permitted tool before answering. Do not claim anything you did not verify.",context:{selectedAgent:"AI CEO"}})});
    const trace=Array.isArray(ceo.data?.toolExecutions)?ceo.data.toolExecutions:[];
    gate("GATE 9 CEO", ceo.r.status===200 && ceo.data?.mode==="ai-agent-live" && String(ceo.data?.reply||"").trim().length>0, `HTTP ${ceo.r.status}, mode=${ceo.data?.mode??"?"}, reply=${String(ceo.data?.reply||"").trim().length>0}`);
    gate("GATE 10 Agent", trace.length>0 && trace.every(x=>x.tool), `toolExecutions=${trace.length}`);
    gate("GATE 11 Tool", trace.length>0 && trace.every(x=>x.result!==undefined), `completed=${trace.filter(x=>x.result!==undefined).length}/${trace.length}`);
    gate("GATE 12 Evidence", trace.length>0 && trace.every(x=>Number.isInteger(Number(x.auditId))), `audit/evidence refs=${trace.filter(x=>Number.isInteger(Number(x.auditId))).length}/${trace.length}`);
    const audits=await req("/api/agent-audit"); const records=Array.isArray(audits.data?.records)?audits.data.records:[];
    gate("GATE 13 Audit", audits.r.status===200 && records.some(x=>x.event_type==="TOOL_EXECUTION"), `HTTP ${audits.r.status}, records=${records.length}`);
    gate("GATE 14 Decision", audits.r.status===200 && records.some(x=>x.event_type==="CEO_DECISION"), `CEO_DECISION=${records.some(x=>x.event_type==="CEO_DECISION")}`);
  } catch(e) { for(const n of ["GATE 9 CEO","GATE 10 Agent","GATE 11 Tool","GATE 12 Evidence","GATE 13 Audit","GATE 14 Decision"]) gate(n,false,String(e)); }

  let approvalId=null;
  try {
    const title=`Production acceptance IMAGE_RESOLVE ${Date.now()}`;
    const ask=await req("/api/ceo-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:`Create a LOW-risk human approval request titled exactly "${title}" for IMAGE_RESOLVE with payload {"limit":1}. Do not execute it until a human approval is granted.`,context:{selectedAgent:"AI CEO"}})});
    const approvals=await req("/api/ceo-approvals"); const rows=Array.isArray(approvals.data?.approvals)?approvals.data.approvals:[]; const pending=rows.find(x=>x.title===title && x.status==="PENDING" && String(x.action_type).toUpperCase()==="IMAGE_RESOLVE"); approvalId=pending?.id??null;
    gate("GATE 15 Approval", ask.r.status===200 && !!approvalId, `HTTP ${ask.r.status}, approvalId=${approvalId??"missing"}`);
    const blocked=await req("/api/agent-execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionType:"IMAGE_RESOLVE",payload:{limit:1},agentName:"Production Acceptance"})});
    gate("GATE 16 Approval enforcement", blocked.r.status===403 && blocked.data?.code==="APPROVAL_REQUIRED", `HTTP ${blocked.r.status}, code=${blocked.data?.code??"?"}`);
    if(approvalId){
      const approved=await req("/api/ceo-approvals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve",id:approvalId,note:"Production acceptance approval for low-risk IMAGE_RESOLVE."})});
      gate("GATE 17 Action", approved.r.status===200 && approved.data?.execution==="EXECUTED", `HTTP ${approved.r.status}, execution=${approved.data?.execution??"?"}`);
      const audits=await req("/api/agent-audit"); const records=Array.isArray(audits.data?.records)?audits.data.records:[]; const ar=records.find(x=>x.event_type==="ACTION_EXECUTION" && Number(x.approval_id)===Number(approvalId) && x.status==="SUCCESS"); const vr=records.find(x=>x.event_type==="APPROVAL_EXECUTION_RESULT" && Number(x.approval_id)===Number(approvalId) && x.status==="SUCCESS");
      gate("GATE 18 Verified Result", !!ar && !!vr, `approvalId=${approvalId}, actionAudit=${!!ar}, verifiedResult=${!!vr}`);
      gate("GATE 19 CEO final response", !!ceo?.data?.reply, `replyPresent=${!!ceo?.data?.reply}`);
    } else { gate("GATE 17 Action",false,"approval missing"); gate("GATE 18 Verified Result",false,"approval missing"); gate("GATE 19 CEO final response",false,"approval missing"); }
  } catch(e) { for(const n of ["GATE 15 Approval","GATE 16 Approval enforcement","GATE 17 Action","GATE 18 Verified Result","GATE 19 CEO final response"]) gate(n,false,String(e)); }

  const failed=gates.filter(x=>!x.ok); console.log(`\nPRODUCTION ACCEPTANCE: ${failed.length?"FAIL":"PASS"}`); if(failed.length){for(const x of failed)console.log(`- ${x.name}: ${x.detail}`);process.exit(1);} 
}
main().catch(e=>{console.error(e);process.exit(1);});
