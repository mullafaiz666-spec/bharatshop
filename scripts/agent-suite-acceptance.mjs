#!/usr/bin/env node
const BASE=(process.env.BHARATSHOP_URL||process.env.BASE_URL||"https://bharatshop-9w4a.onrender.com").replace(/\/$/,"");
const token=process.env.BHARATSHOP_AUTOMATION_TOKEN||"";
if(!token)throw new Error("BHARATSHOP_AUTOMATION_TOKEN is required for agent-suite acceptance");
const headers={Authorization:`Bearer ${token}`,"x-automation-token":token,"Content-Type":"application/json"};
async function json(path,init={}){const r=await fetch(`${BASE}${path}`,{...init,headers:{...headers,...(init.headers||{})},cache:"no-store",signal:AbortSignal.timeout(60000)});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw new Error(`${path} returned HTTP ${r.status}: ${t.slice(0,300)}`)};if(!r.ok)throw new Error(`${path} returned HTTP ${r.status}: ${JSON.stringify(d).slice(0,500)}`);return d;}
console.log(`Agent suite acceptance target: ${BASE}`);
const health=await json("/api/agents/health");
const agents=Array.isArray(health.agents)?health.agents:[];
const expected=["ceo","source-discovery","source-verification","seller-discovery","listing","marketing","advertising","order-recheck","tracking","learning","automation","web-design"];
let failed=false;
for(const id of expected){const a=agents.find(x=>x.id===id);const pass=Boolean(a?.ready);console.log(`${pass?"PASS":"FAIL"}  agent ${id}  ${a?.reason||"missing from registry"}`);if(!pass)failed=true;}
if(agents.length!==expected.length){console.log(`FAIL  agent registry count  expected=${expected.length} actual=${agents.length}`);failed=true;}else console.log(`PASS  agent registry count  ${agents.length}`);
console.log(`${health?.freeInfrastructure?.serpApiRequired===false?"PASS":"FAIL"}  free seller discovery  SerpAPI required=${health?.freeInfrastructure?.serpApiRequired}`);if(health?.freeInfrastructure?.serpApiRequired!==false)failed=true;

const marketing=await json("/api/marketing/connections",{method:"POST",body:"{}"});
const channels=Array.isArray(marketing.channels)?marketing.channels:[];
const metaConfig=marketing.metaConfiguration||{};
const browserPixelReady=metaConfig.browserPixelConfigured===true;
const capiReady=metaConfig.conversionsApiConfigured===true;
console.log(`${browserPixelReady?"PASS":"FAIL"}  Meta browser Pixel configuration  configured=${browserPixelReady}`);if(!browserPixelReady)failed=true;
console.log(`${capiReady?"PASS":"FAIL"}  Meta Conversions API configuration  configured=${capiReady}`);if(!capiReady)failed=true;
for(const key of ["google","meta","facebook","instagram","meta-capi"]){
  const c=channels.find(x=>x.key===key);
  if(!c){console.log(`FAIL  ${key} integration  missing from connection registry`);failed=true;continue;}
  if(c.status==="VERIFIED"){console.log(`PASS  ${key} integration  configured=true connected=true`);continue;}
  if(c.status==="NOT_CONFIGURED"){
    console.log(`FAIL  ${key} integration  not configured; missing=${(c.missing||[]).join(",")}`);
    failed=true;
    continue;
  }
  console.log(`FAIL  ${key} integration  status=${c.status} error=${c.error||"unknown"}`);failed=true;
}
console.log(`\nAGENT + MARKETING ACCEPTANCE: ${failed?"FAIL":"PASS"}`);
if(failed)process.exit(1);
