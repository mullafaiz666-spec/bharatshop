#!/usr/bin/env node

import { readFileSync } from "node:fs";

const BASE=(process.env.BHARATSHOP_URL||process.env.BASE_URL||"https://bharatshop-9w4a.onrender.com").replace(/\/$/,"");
const TOKEN=process.env.BHARATSHOP_AUTOMATION_TOKEN||"";
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
function isRealClientOrder(order){
  const ref=String(order?.orderRef||"").trim(),source=String(order?.source||"").toLowerCase(),shopifyId=String(order?.shopifyOrderId||"").trim();
  const markers=`${ref} ${source} ${order?.notes||""} ${order?.customerName||""} ${order?.customerEmail||""}`.toLowerCase();
  if(/\b(test|demo|acceptance|synthetic|fixture|seed)\b/i.test(markers)) return false;
  const ownWebsite=source==="own_website"&&/^BS-WEB-/i.test(ref),shopify=source.includes("shopify")||shopifyId.length>0;
  const email=String(order?.customerEmail||"").trim(),phone=String(order?.customerPhone||"").replace(/\D/g,"");
  return Boolean((ownWebsite||shopify)&&email.includes("@")&&phone.length>=10&&Number(order?.totalAmountInr)>0);
}
function preparedCeoCycle(){
  try{return JSON.parse(readFileSync("/tmp/ceo2.json","utf8"));}catch{return null;}
}

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

  let realClientOrders=[];
  try{
    const o=await req("/api/storefront/orders?limit=100");
    const orders=Array.isArray(o.data?.orders)?o.data.orders:[];
    realClientOrders=orders.filter(isRealClientOrder);
    const legacyMisclassified=orders.filter(x=>/^BD-WEB-/i.test(String(x.orderRef||""))&&isRealClientOrder(x));
    gate("GATE 15 Client order classifier",o.r.status===200&&legacyMisclassified.length===0?"PASS":"FAIL",`HTTP ${o.r.status}; candidates=${orders.length}; genuineClients=${realClientOrders.length}; legacyMisclassified=${legacyMisclassified.length}`);
  }catch(e){gate("GATE 15 Client order classifier","FAIL",String(e));}

  try{
    const cycle=preparedCeoCycle();
    const gateActive=cycle?.orders?.humanInteractionGate===true;
    const expected=realClientOrders.length>0;
    gate("GATE 16 Human gate timing",cycle&&gateActive===expected?"PASS":"FAIL",`genuineClients=${realClientOrders.length}; humanInteractionGate=${cycle?.orders?.humanInteractionGate}; expected=${expected}`);
  }catch(e){gate("GATE 16 Human gate timing","FAIL",String(e));}

  try{
    const q=await req("/api/ceo-approvals");
    const approvals=Array.isArray(q.data?.approvals)?q.data.approvals:[];
    const synthetic=approvals.filter(x=>/production acceptance/i.test(String(x.title||""))&&String(x.status||"").toUpperCase()==="PENDING");
    gate("GATE 17 No synthetic approvals",q.r.status===200&&synthetic.length===0?"PASS":"FAIL",`HTTP ${q.r.status}; pendingSynthetic=${synthetic.length}`);
  }catch(e){gate("GATE 17 No synthetic approvals","FAIL",String(e));}

  if(realClientOrders.length===0){
    gate("GATE 18 Consequential order protection","PASS","No genuine client order exists; no human fulfillment gate is exercised by acceptance.");
  }else{
    try{
      const order=realClientOrders[0];
      const blocked=await req("/api/agent-execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actionType:"ORDER_RECHECK",payload:{orderId:order.id},agentName:"Production Acceptance"})});
      gate("GATE 18 Consequential order protection",blocked.r.status===403&&String(blocked.data?.code)==="APPROVAL_REQUIRED"?"PASS":"FAIL",`realOrder=${order.orderRef}; HTTP ${blocked.r.status}; code=${blocked.data?.code}`);
    }catch(e){gate("GATE 18 Consequential order protection","FAIL",String(e));}
  }

  const failed=gates.filter(x=>x.status==="FAIL");
  console.log(`\nPRODUCTION ACCEPTANCE: ${failed.length?"FAIL":"PASS"} (0 manual gate(s))`);
  if(failed.length){for(const x of failed)console.log(`- ${x.name}: ${x.detail}`);process.exit(1);}
}

main().catch(e=>{console.error(e);process.exit(1);});