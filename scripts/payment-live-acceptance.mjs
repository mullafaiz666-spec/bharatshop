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
const checkoutReady=response.ok&&data?.status==="READY"&&data?.allAuthenticated===true&&data?.selectedModeReady===true&&razorpayLive&&cashfreeLive;
if(!rp.webhookConfigured)console.log("WARN  Razorpay webhook secret is not configured; immediate checkout is still server-verified, but asynchronous webhook recovery is not active.");
if(!cf.webhookConfigured)console.log("WARN  Cashfree webhook verification is not configured.");
console.log(`\nLIVE PAYMENT CHECKOUT ACCEPTANCE: ${checkoutReady?"PASS":"FAIL"}`);
console.log(`ASYNC WEBHOOK RECOVERY: ${rp.webhookConfigured&&cf.webhookConfigured?"PASS":"PARTIAL"}`);
if(!checkoutReady)process.exit(1);
