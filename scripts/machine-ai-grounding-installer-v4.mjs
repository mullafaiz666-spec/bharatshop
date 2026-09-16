#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const root = process.cwd();
function run(command,args,opts={}) {
  const r = spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...opts});
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);
}
function capture(command,args) {
  return String(execFileSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true})||'').trim();
}
function assert(condition,message){if(!condition)throw new Error(message);}

const branch = capture('git',['branch','--show-current']);
assert(branch === 'feature/machine-ai-v2-local', `Wrong local branch: ${branch}`);

run('git',['fetch','origin','feature/machine-ai-grounding-installer-v3']);
let src = capture('git',['show','origin/feature/machine-ai-grounding-installer-v3:scripts/machine-ai-grounding-installer-v3.mjs']);
const oldLine = "run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);";
const newLine = "if(process.platform==='win32')run('cmd.exe',['/d','/s','/c','npm.cmd run typecheck']);else run('npm',['run','typecheck']);";
assert(src.includes(oldLine),'Windows typecheck anchor not found in v3 installer');
src = src.replace(oldLine,newLine);

const temp = join(os.tmpdir(),'machine-ai-grounding-installer-v4-inner.mjs');
writeFileSync(temp,src,'utf8');
try {
  console.log('\n=== MACHINE AI GROUNDING V4 ===');
  run(process.execPath,[temp]);
  console.log('\n=== POST-INSTALL HEALTH ===');
  run(process.execPath,['scripts/machine-ai-web-manager.mjs','status']);

  const ollama = await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)});
  assert(ollama.ok,`Ollama health HTTP ${ollama.status}`);
  const models = await ollama.json();
  const names = (models?.models||[]).map(x=>x.name);
  assert(names.includes('qwen3.5:4b'),`qwen3.5:4b not found in Ollama models: ${names.join(', ')}`);
  console.log('OLLAMA: READY qwen3.5:4b');

  const ui = await fetch('http://127.0.0.1:3001/',{signal:AbortSignal.timeout(5000)});
  assert(ui.ok,`Machine AI UI HTTP ${ui.status}`);
  const html = await ui.text();
  assert(/Machine AI|BharatShop/i.test(html),'Machine AI UI returned unexpected content');
  console.log('MACHINE AI UI: READY http://127.0.0.1:3001');

  run('cmd.exe',['/d','/s','/c','npm.cmd run typecheck']);
  run('cmd.exe',['/d','/s','/c','npm.cmd run build']);
  run('git',['diff','--check']);

  console.log('\n=== V4 VERIFIED ===');
  console.log(capture('git',['log','-2','--oneline']));
  console.log(capture('git',['status','--short']) || '(tracked tree clean)');
  console.log('\nNEXT: run the BharatShop stored-memory end-to-end chat test in the local UI.');
} finally {
  try { unlinkSync(temp); } catch {}
}
