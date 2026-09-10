#!/usr/bin/env node
const BASE=(process.env.BHARATSHOP_URL||process.env.BASE_URL||"https://bharatshop-9w4a.onrender.com").replace(/\/$/,"");
const token=process.env.BHARATSHOP_AUTOMATION_TOKEN||"";
if(!token)throw new Error("BHARATSHOP_AUTOMATION_TOKEN is required for payment diagnostics");
const response=await fetch(`${BASE}/api/payments/diagnostics`,{headers:{Authorization:`Bearer ${token}`,"x-automation-token":token},cache:"no-store",signal:AbortSignal.timeout(45000)});
const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error(`Payment diagnostics returned HTTP ${response.status}: ${text.slice(0,300)}`)}
const rp=data?.razorpay||{},cf=data?.cashfree||{};
console.log(`Payment diagnostics target: ${BASE}`);
console.log(`${rp.configured&&rp.authenticated?"PASS":"FAIL"}  Razorpay credentials  configured=${Boolean(rp.configured)} authenticated=${Boolean(rp.authenticated)} http=${rp.httpStatus??"n/a"} mode=${rp.keyMode||"unknown"} webhook=${Boolean(rp.webhookConfigured)}`);
console.log(`${cf.configured&&cf.authenticated?"PASS":"FAIL"}  Cashfree credentials  configured=${Boolean(cf.configured)} authenticated=${Boolean(cf.authenticated)} http=${cf.httpStatus??"n/a"} selected=${cf.selectedMode||"unknown"} detected=${cf.detectedMode||"none"} webhook=${Boolean(cf.webhookConfigured)}`);
if(cf.modeMismatch)console.log(`FAIL  Cashfree environment mismatch  set PAYMENT_MODE=${cf.detectedMode}`);
const razorpayLive=rp.configured===true&&rp.authenticated===true&&rp.keyMode==="live";
const cashfreeLive=cf.configured===true&&cf.authenticated===true&&cf.selectedMode==="live"&&cf.detectedMode==="live"&&!cf.modeMismatch;
const webhooksReady=rp.webhookConfigured===true&&cf.webhookConfigured===true;
const productionReady=response.ok&&data?.status==="READY"&&data?.allAuthenticated===true&&data?.selectedModeReady===true&&razorpayLive&&cashfreeLive&&webhooksReady;
console.log(`${rp.webhookConfigured?"PASS":"FAIL"}  Razorpay webhook recovery  configured=${Boolean(rp.webhookConfigured)}`);
console.log(`${cf.webhookConfigured?"PASS":"FAIL"}  Cashfree webhook recovery  configured=${Boolean(cf.webhookConfigured)}`);
console.log(`\nPRODUCTION PAYMENT ACCEPTANCE: ${productionReady?"PASS":"FAIL"}`);
if(!productionReady)process.exit(1);
