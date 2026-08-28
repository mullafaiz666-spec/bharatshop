import process from 'node:process';
const base=process.env.BHARATSHOP_URL?.replace(/\/$/,''); const token=process.env.BHARATSHOP_AUTOMATION_TOKEN;
if(!base||!token) throw new Error('BHARATSHOP_URL and BHARATSHOP_AUTOMATION_TOKEN are required');
async function post(path,body){const r=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'x-automation-token':token},body:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw new Error(`${path} ${r.status}: ${text.slice(0,1000)}`);return text;}
console.log(await post('/api/automation/catalog-maintenance',{mode:'research',limit:10,batchSize:10,aiBatch:true,publishVerified:true}));
console.log(await post('/api/automation/catalog-maintenance',{mode:'maintenance',limit:10,batchSize:10}));
