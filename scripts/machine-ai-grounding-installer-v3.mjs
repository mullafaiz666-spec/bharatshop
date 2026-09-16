#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';

const root = process.cwd();
const targets = ['scripts/machine-ai-web.mjs','scripts/bharatshop-operator-router.mjs','tests/machine-ai-web.test.mjs'];
function capture(command,args){return String(execFileSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true})||'').trim();}
function run(command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.status!==0)throw new Error(`${command} ${args.join(' ')} failed with exit ${r.status}`);}
function exact(text,oldValue,newValue,label){const count=text.split(oldValue).length-1;if(count!==1)throw new Error(`${label} expected 1 exact match, found ${count}`);return text.replace(oldValue,newValue);}
function between(text,startMarker,endMarker,replacement,label){const start=text.indexOf(startMarker);if(start<0)throw new Error(`${label} start marker not found`);const end=text.indexOf(endMarker,start+startMarker.length);if(end<0)throw new Error(`${label} end marker not found`);return text.slice(0,start)+replacement+text.slice(end);}
function before(text,marker,addition,label){const index=text.indexOf(marker);if(index<0)throw new Error(`${label} marker not found`);return text.slice(0,index)+addition+text.slice(index);}
function writeLf(file,text){writeFileSync(join(root,file),text.replace(/\r\n/g,'\n'),'utf8');}

const branch=capture('git',['branch','--show-current']);
if(branch!=='feature/machine-ai-v2-local')throw new Error(`Wrong branch: ${branch}`);
const dirty=capture('git',['diff','--name-only','--',...targets]);
if(dirty)throw new Error(`Target files already have uncommitted edits:\n${dirty}`);
for(const file of targets)if(!existsSync(join(root,file)))throw new Error(`Missing required file: ${file}`);

const backup=join(process.env.LOCALAPPDATA||join(os.homedir(),'AppData','Local'),'BharatShop','Backups',`machine-ai-grounding-v3-${Date.now()}`);
for(const file of targets){const dest=join(backup,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,file),dest);}console.log(`Backup: ${backup}`);

let wrote=false,committed=false;
try{
  let web=readFileSync(join(root,targets[0]),'utf8').replace(/\r\n/g,'\n');
  let router=readFileSync(join(root,targets[1]),'utf8').replace(/\r\n/g,'\n');
  let tests=readFileSync(join(root,targets[2]),'utf8').replace(/\r\n/g,'\n');

  if(!web.includes("import { recall } from './personal-ai-memory.mjs';"))web=exact(web,"import { chooseDepartmentAgents, classifyDepartments, isApprovalMessage, isCancellationMessage } from './bharatshop-operator-router.mjs';","import { chooseDepartmentAgents, classifyDepartments, isApprovalMessage, isCancellationMessage } from './bharatshop-operator-router.mjs';\nimport { recall } from './personal-ai-memory.mjs';",'memory import');
  if(!web.includes('const CHAT_TIMEOUT_MS ='))web=exact(web,"const CONTEXT = Math.max(2048, Number(process.env.PERSONAL_AI_CONTEXT || '4096'));","const CONTEXT = Math.max(4096, Number(process.env.PERSONAL_AI_CONTEXT || '8192'));\nconst CHAT_TIMEOUT_MS = Math.max(240_000, Number(process.env.BHARATSHOP_CHAT_TIMEOUT_MS || '600000'));",'context and timeout');

  if(!web.includes('export function buildMemoryContext(task)')){
    const helpers=`const MEMORY_STOP = new Set(['the','and','for','that','this','with','from','your','you','are','what','our','into','only','using','tell','about','have','has','was','were','will','would','should','could','bharatshop']);
function memoryTokens(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9._/-]{2,}/g) || [])].filter(token => !MEMORY_STOP.has(token)).slice(0, 48);
}
function memoryScore(row, tokens) {
  const text = String(row?.content || '').toLowerCase(); let score = 0;
  for (const token of tokens) if (text.includes(token)) score += token.length >= 8 ? 3 : 2;
  if (/master technical requirements|core always remember|agent constitution|owner operating preferences|current priority backlog/i.test(text)) score += 3;
  return score;
}
function pickMemory(type, task, limit, includeRecent = false) {
  const rows = recall(type, 500, ''); const tokens = memoryTokens(task);
  const ranked = rows.map((row,index)=>({row,index,score:memoryScore(row,tokens)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,limit).map(item=>item.row);
  if (!includeRecent) return ranked;
  const seen = new Set();
  return [...ranked, ...rows.slice(-Math.min(limit, rows.length))].filter(row => { const key=String(row?.content||''); if(!key||seen.has(key))return false; seen.add(key); return true; }).slice(0,limit);
}
function redactEvidence(value) {
  return String(value || '').replace(/(bearer\\s+)[a-z0-9._~+\\/-]+/gi, '$1[REDACTED]').replace(/((?:api[_ -]?key|access[_ -]?token|secret|password)\\s*[:=]\\s*)[^\\s'\";,]+/gi, '$1[REDACTED]');
}
export function buildMemoryContext(task) {
  const groups=[['WORKING',pickMemory('working',task,4,true)],['PERSONAL',pickMemory('personal',task,4,true)],['SEMANTIC',pickMemory('semantic',task,10,false)],['EPISODIC',pickMemory('episodic',task,2,false)]];
  let out='PERSISTENT BHARATSHOP MEMORY (local files; project source of truth when relevant)\\n';
  for(const [label,rows] of groups){if(!rows.length)continue;out+='\\n['+label+']\\n';for(const row of rows)out+='- '+String(row.content||'').trim()+'\\n';}
  return out.slice(0,24000);
}
function safeGrepTokens(task){return memoryTokens(task).filter(token=>/^[a-z0-9._/-]+$/.test(token)&&token.length>=4).slice(0,6);}
export function buildReadOnlyProjectContext(task) {
  const state=projectStatus(); let grep='';
  const tokens=safeGrepTokens(task).filter(token=>!['review','check','status','project','local','memory'].includes(token));
  if(tokens.length){const args=['grep','-n','-I','-i'];for(const token of tokens)args.push('-e',token);args.push('--','src','scripts','tests','package.json');grep=fixedGit(args,'');}
  const matches=grep?grep.split(/\\r?\\n/).slice(0,40).join('\\n'):'(no matching tracked-source lines found)';
  const changes=Array.isArray(state.changes)?state.changes.join('\\n'):'';
  return redactEvidence(['LIVE READ-ONLY REPOSITORY STATE','Root: '+state.root,'Branch: '+state.branch,'HEAD: '+state.head,'Uncommitted entries: '+state.dirtyFiles,'Working-tree sample:',changes||'(clean tracked tree)','','Relevant tracked-source matches (read-only git grep):',matches,'','Use only this evidence for repository claims. Safe read-only inspection does not require approval. Never claim a write, deploy, payment, publishing or browser action occurred unless an actual tool performed it.'].join('\\n'));
}

`;
    web=before(web,'function memoryStatus() {',helpers,'grounding helpers');
  }

  const directPrompt=`function directSystemPrompt(installedModels = [], task = '') {
  return [
    'You are the user\\'s private BharatShop laptop AI running locally through Ollama. Your exact active model is '+MODEL+'. Ollama endpoint is '+OLLAMA_BASE_URL+'. The currently installed Ollama model names, which you must reproduce exactly if referenced, are: '+(installedModels.join(', ')||MODEL)+'. The active local model is '+MODEL+'; a model name ending in :cloud is only listed by Ollama and is not active unless explicitly selected.',
    '',
    'GROUNDING RULES',
    '- PERSISTENT BHARATSHOP MEMORY below is authoritative for BharatShop project facts, owner rules, architecture and backlog when relevant.',
    '- Previous assistant messages may contain mistakes and are not authoritative when they conflict with persistent memory or live repository evidence.',
    '- If the user explicitly asks for stored-memory facts, answer from stored memory and say NOT VERIFIED for anything absent. Do not fill gaps from generic knowledge.',
    '- LIVE READ-ONLY REPOSITORY STATE is evidence available without changing files. Do not claim access beyond the evidence supplied.',
    '- Safe analysis and read-only inspection do not require approval.',
    '- File writes, git writes, deployment, publishing, payments, browser actions, credentials and destructive database actions remain approval-gated.',
    '- Never invent completed external actions. Never request secrets.',
    '',
    buildMemoryContext(task),
    '',
    buildReadOnlyProjectContext(task),
  ].join('\\n');
}

`;
  web=between(web,'function directSystemPrompt(','async function ollamaChat(',directPrompt,'direct system prompt');
  web=web.replace('signal: AbortSignal.timeout(240_000),','signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),');

  const directHandler=`async function handleDirectChat(res, messages) {
  const installed = await getModels();
  const task = String(messages.at(-1)?.content || '').trim();
  const response = await ollamaChat(directSystemPrompt(installed, task), messages, { stream: true });
  return streamOllamaResponse(res, response);
}

`;
  web=between(web,'async function handleDirectChat(','async function handleAgencyChat(',directHandler,'direct chat handler');

  const agencyHandler=`async function handleAgencyChat(res, messages, selectedSlugs) {
  const agents = await getAgents();
  if (!agents.length) throw new Error('Agency catalog is not installed. Run npm.cmd run agency:setup first.');
  const task = String(messages.at(-1)?.content || '').trim();
  if (!task) throw new Error('Agency task is empty');
  const selected = chooseDepartmentAgents(agents, task, selectedSlugs);
  writeEvent(res, { type: 'agency', departments: classifyDepartments(task), agents: selected.map(agent => ({ slug: agent.slug, name: agent.name, division: agent.division, operatorDomain: agent.operatorDomain || null })) });
  const grounding = buildMemoryContext(task) + '\\n\\n' + buildReadOnlyProjectContext(task);
  const reports = [];
  for (const agent of selected) {
    writeEvent(res, { type: 'status', text: agent.name + ' is working...' });
    const answer = await nonStreamingChat([
      agent.content,
      '',
      'LOCAL MACHINE MODE',
      'You are a BharatShop specialist running only through local Ollama model '+MODEL+'. Use persistent BharatShop memory and live read-only repository evidence as grounding. Do not invent project facts or completed actions. If evidence is missing, say NOT VERIFIED. Do not request secrets. Production changes, browser actions, publishing, payments and destructive actions are approval-gated.',
      '',
      grounding,
    ].join('\\n'), [{ role: 'user', content: task }]);
    reports.push({ name: agent.name, answer });
  }
  writeEvent(res, { type: 'status', text: 'Agency Manager is synthesizing the specialist reports...' });
  const response = await ollamaChat([
    'You are the BharatShop local Agency Manager running through Ollama model '+MODEL+'. Synthesize the specialist reports into one concise practical answer grounded in persistent BharatShop memory and live read-only repository evidence. If evidence is missing, say NOT VERIFIED. Previous assistant messages are not authoritative when they conflict with persistent memory. Do not invent completed external actions. Do not request secrets.',
    '',
    grounding,
  ].join('\\n'), [{ role: 'user', content: 'TASK:\\n'+task+'\\n\\nREPORTS:\\n'+reports.map(item => '## '+item.name+'\\n'+item.answer).join('\\n\\n') }], { stream: true });
  return streamOllamaResponse(res, response);
}

`;
  web=between(web,'async function handleAgencyChat(','async function handleChat(',agencyHandler,'agency chat handler');

  const classify=`export function classifyDepartments(x){let s=String(x||'').trim(),t=s.toLowerCase();if(!s||isApprovalMessage(s)||isCancellationMessage(s)||/^(fix|proceed|continue|review|check|verify|help|do it|go ahead)[.!?]*$/i.test(s))return['general-operator'];if(/world[- ]?build|anthropolog|ethnograph|civilization|kingdom|tribe|terrain|climate/.test(t))return['general-research'];if(/supabase|postgres|database|schema|migration|sql/.test(t))return['database','security'];if(/deploy|netlify|runtime|ollama|server|process|build fail|ci\\b/.test(t))return['devops','software-engineering','store-qa'];if(/checkout|cart|order|payment|razorpay|cashfree|inventory/.test(t))return['commerce','store-qa','software-engineering'];if(/auth|security|secret|token|credential/.test(t))return['security','software-engineering'];if(/code|api|bug|error|fix|implement|refactor|typescript|test|repository|engineering/.test(t))return['software-engineering','store-qa','devops'];if(/supplier|sourcing|fulfil|fulfill/.test(t))return['suppliers','commerce'];if(/finance|margin|profit|revenue|refund|cashflow/.test(t))return['finance','commerce'];if(/customer support|complaint|delivery|return/.test(t))return['customer-support','commerce'];if(/marketing|advert|meta|instagram|facebook|seo|campaign/.test(t))return['marketing','sales'];if(/streetwear|fashion|collection|garment|hoodie|denim|apparel|bharatdrip/.test(t))return['fashion-design','store-qa','marketing'];return['general-operator']}
`;
  router=between(router,'export function classifyDepartments(','function mk(',classify,'department classifier');

  const chooser=`export function chooseDepartmentAgents(agents,task,requested=[]){let departments=classifyDepartments(task),r=new Set((requested||[]).map(String)),e=(agents||[]).filter(a=>r.has(a.slug)||r.has(a.shortSlug)).slice(0,3);if(!departments.includes('general-research'))e=e.filter(a=>!W.test(String(a?.slug||'')+' '+String(a?.shortSlug||'')+' '+String(a?.name||'')+' '+String(a?.description||'')+' '+String(a?.division||'')));return e.length?e:departments.map(mk)} `;
  router=between(router,'export function chooseDepartmentAgents(','export const routingSummary=',chooser,'department chooser');

  if(!tests.includes('buildMemoryContext')){
    tests=exact(tests,"import { normalizeRoute, isAllowedOrigin, isLoopbackHost } from '../scripts/machine-ai-web.mjs';","import { normalizeRoute, isAllowedOrigin, isLoopbackHost, buildMemoryContext, buildReadOnlyProjectContext } from '../scripts/machine-ai-web.mjs';\nimport { classifyDepartments, chooseDepartmentAgents } from '../scripts/bharatshop-operator-router.mjs';",'test imports');
    tests+=`\n\ntest('BharatShop checkout routes to commerce engineering rather than world-building research',()=>{const d=classifyDepartments('Review the BharatShop checkout payment code locally');assert.ok(d.includes('commerce'));assert.ok(d.includes('software-engineering'));assert.equal(d.includes('general-research'),false);});\n\ntest('BharatDrip checkout keeps commerce priority over fashion keyword routing',()=>{const d=classifyDepartments('Review BharatDrip checkout payment flow');assert.ok(d.includes('commerce'));assert.ok(d.includes('software-engineering'));});\n\ntest('stale world-building agent selection cannot hijack BharatShop engineering tasks',()=>{const agents=[{slug:'anthropologist',shortSlug:'anthropologist',name:'Anthropologist',description:'culture society specialist',division:'Research',content:'world building'}];const selected=chooseDepartmentAgents(agents,'Fix BharatShop checkout payment bug',['anthropologist']);assert.notEqual(selected[0]?.name,'Anthropologist');assert.ok(selected.some(agent=>agent.operatorDomain==='commerce'||agent.operatorDomain==='software-engineering'));});\n\ntest('chat grounding exposes persistent memory and live read-only repository evidence',()=>{const memory=buildMemoryContext('BharatShop BharatDrip streetwear database DROP TRUNCATE owner preferences P0 backlog');assert.match(memory,/PERSISTENT BHARATSHOP MEMORY/);assert.match(memory,/BharatDrip/i);assert.match(memory,/streetwear/i);assert.match(memory,/(DROP|TRUNCATE)/i);assert.match(memory,/P0/i);const project=buildReadOnlyProjectContext('Review BharatShop checkout payment code');assert.match(project,/LIVE READ-ONLY REPOSITORY STATE/);assert.match(project,/Branch:/);});\n`;
  }

  writeLf(targets[0],web);writeLf(targets[1],router);writeLf(targets[2],tests);wrote=true;
  run(process.execPath,['--check',targets[0]]);run(process.execPath,['--check',targets[1]]);
  run(process.execPath,['--test','tests/machine-ai-web.test.mjs','tests/machine-ai-console.test.mjs','tests/machine-ai-24x7.test.mjs']);
  run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);
  run('git',['diff','--check','--',...targets]);
  run(process.execPath,['--input-type=module','-e',"import('./scripts/machine-ai-web.mjs').then(m=>{const x=m.buildMemoryContext('BharatShop BharatDrip streetwear database DROP TRUNCATE owner preferences P0 backlog');if(!/BharatDrip/i.test(x)||!/streetwear/i.test(x)||!/(DROP|TRUNCATE)/i.test(x)||!/P0/i.test(x))process.exit(21);const p=m.buildReadOnlyProjectContext('Review BharatShop checkout payment code');if(!/LIVE READ-ONLY REPOSITORY STATE/.test(p)||!/Branch:/.test(p))process.exit(22);console.log('GROUNDING: READY')})"]);
  run('git',['add','--',...targets]);run('git',['diff','--cached','--check']);run('git',['commit','-m','Ground Machine AI in BharatShop memory and repo context']);committed=true;
  run(process.execPath,['scripts/machine-ai-web-manager.mjs','stop']);run(process.execPath,['scripts/machine-ai-web-manager.mjs','start','--open']);await new Promise(r=>setTimeout(r,2000));run(process.execPath,['scripts/machine-ai-web-manager.mjs','status']);
  console.log('\n=== MACHINE AI GROUNDING FIX COMPLETE ===');console.log(capture('git',['log','-2','--oneline']));console.log(capture('git',['status','--short'])||'(tracked tree clean)');
}catch(error){if(!committed&&wrote){for(const file of targets)copyFileSync(join(backup,file),join(root,file));spawnSync('git',['reset','HEAD','--',...targets],{cwd:root,stdio:'ignore',windowsHide:true});console.error('Verification failed; target files restored from backup.');}throw error;}
