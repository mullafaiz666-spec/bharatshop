#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const root = process.cwd();
function run(command,args){
  const r=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});
  if(r.status!==0)throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
}
function capture(command,args){return String(execFileSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true})||'').trim();}
function assert(condition,message){if(!condition)throw new Error(message);}

const branch=capture('git',['branch','--show-current']);
assert(branch==='feature/machine-ai-v2-local',`Wrong local branch: ${branch}`);

run('git',['fetch','origin','feature/machine-ai-grounding-installer-v3']);
let src=capture('git',['show','origin/feature/machine-ai-grounding-installer-v3:scripts/machine-ai-grounding-installer-v3.mjs']);

const oldTypecheck="run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);";
const newTypecheck="if(process.platform==='win32')run('cmd.exe',['/d','/s','/c','npm.cmd run typecheck']);else run('npm',['run','typecheck']);";
assert(src.includes(oldTypecheck),'Windows typecheck anchor missing');
src=src.replace(oldTypecheck,newTypecheck);

const verifyAnchor="run('git',['diff','--check','--',...targets]);";
const verifyReplacement="if(process.platform==='win32')run('cmd.exe',['/d','/s','/c','npm.cmd run build']);else run('npm',['run','build']);\n  run('git',['diff','--check','--',...targets]);";
assert(src.includes(verifyAnchor),'Build verification anchor missing');
src=src.replace(verifyAnchor,verifyReplacement);

const oldCommit="run('git',['add','--',...targets]);run('git',['diff','--cached','--check']);run('git',['commit','-m','Ground Machine AI in BharatShop memory and repo context']);committed=true;";
const newCommit="run('git',['add','--',...targets]);run('git',['diff','--cached','--check']);const staged=capture('git',['diff','--cached','--name-only','--',...targets]);if(staged){run('git',['commit','-m','Ground Machine AI in BharatShop memory and repo context']);console.log('GROUNDING COMMIT: CREATED');}else{const remaining=capture('git',['diff','--name-only','--',...targets]);if(remaining)throw new Error('Grounding files changed but Git did not stage them: '+remaining);console.log('GROUNDING COMMIT: NOT NEEDED - verified content already matches HEAD');}committed=true;";
assert(src.includes(oldCommit),'Commit anchor missing');
src=src.replace(oldCommit,newCommit);

const temp=join(os.tmpdir(),'machine-ai-grounding-installer-v5-inner.mjs');
writeFileSync(temp,src,'utf8');
try{
  console.log('\n=== MACHINE AI GROUNDING V5 ===');
  run(process.execPath,[temp]);

  console.log('\n=== LOCAL RUNTIME HEALTH ===');
  run(process.execPath,['scripts/machine-ai-web-manager.mjs','status']);

  const ollama=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)});
  assert(ollama.ok,`Ollama health HTTP ${ollama.status}`);
  const modelBody=await ollama.json();
  const names=(modelBody?.models||[]).map(x=>x.name);
  assert(names.includes('qwen3.5:4b'),`qwen3.5:4b missing from Ollama: ${names.join(', ')}`);
  console.log('OLLAMA: READY qwen3.5:4b');

  const ui=await fetch('http://127.0.0.1:3001/',{signal:AbortSignal.timeout(5000)});
  assert(ui.ok,`Machine AI UI HTTP ${ui.status}`);
  const html=await ui.text();
  assert(/Machine AI|BharatShop/i.test(html),'Unexpected Machine AI UI response');
  console.log('MACHINE AI UI: READY http://127.0.0.1:3001');

  const project=await fetch('http://127.0.0.1:3001/api/project',{signal:AbortSignal.timeout(5000)});
  assert(project.ok,`/api/project HTTP ${project.status}`);
  const projectJson=await project.json();
  assert(String(projectJson?.branch||'').includes('feature/machine-ai-v2-local'),'Machine AI project endpoint is not reading the expected local branch');
  console.log('PROJECT AWARENESS: READY');

  const memory=await fetch('http://127.0.0.1:3001/api/memory',{signal:AbortSignal.timeout(5000)});
  assert(memory.ok,`/api/memory HTTP ${memory.status}`);
  const memoryJson=await memory.json();
  assert(memoryJson?.available===true,'Persistent memory endpoint is not available');
  console.log('MEMORY ENDPOINT: READY');

  console.log('\n=== END-TO-END STORED MEMORY CHAT ===');
  const prompt='Using only your persistent BharatShop memory, answer in exactly five short lines labelled BHARATSHOP, BHARATDRIP, MODEL, DB_RULES, and P0. State what BharatShop is, what BharatDrip is, the local AI model/runtime, the absolute production database prohibitions, and the current P0 work. Do not use generic knowledge. Do not guess. If missing, say NOT VERIFIED.';
  const chat=await fetch('http://127.0.0.1:3001/api/chat',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({mode:'chat',messages:[{role:'user',content:prompt}],selectedAgents:[]}),
    signal:AbortSignal.timeout(300000),
  });
  assert(chat.ok,`/api/chat HTTP ${chat.status}`);
  const raw=await chat.text();
  const events=raw.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);
  const errors=events.filter(e=>e.type==='error').map(e=>e.error).filter(Boolean);
  assert(!errors.length,`Machine AI chat error: ${errors.join(' | ')}`);
  const answer=events.filter(e=>e.type==='delta').map(e=>e.text||'').join('');
  console.log(answer);
  assert(/BharatDrip/i.test(answer),'Chat did not mention BharatDrip');
  assert(/streetwear/i.test(answer),'Chat did not identify BharatDrip as streetwear');
  assert(/qwen3\.5:4b/i.test(answer),'Chat did not identify qwen3.5:4b');
  assert(/Ollama/i.test(answer),'Chat did not identify Ollama');
  assert(/DROP|TRUNCATE|destructive/i.test(answer),'Chat did not recall production database prohibitions');
  assert(!/BharatDrip is (the )?(local )?database engine/i.test(answer),'Old BharatDrip database-engine hallucination still present');
  assert(!/Indian artisans/i.test(answer),'Old BharatShop artisan hallucination still present');
  console.log('END-TO-END MEMORY CHAT: READY');

  run('git',['diff','--check']);
  console.log('\n=== MACHINE AI V5 VERIFIED ===');
  console.log(capture('git',['log','-3','--oneline']));
  console.log(capture('git',['status','--short'])||'(tracked tree clean)');
}catch(error){
  console.error('\nV5 VERIFICATION FAILED:',error instanceof Error?error.message:String(error));
  process.exitCode=1;
}finally{
  try{unlinkSync(temp)}catch{}
}
