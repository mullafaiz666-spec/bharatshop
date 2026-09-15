#!/usr/bin/env node

import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { chooseDepartmentAgents, classifyDepartments, isApprovalMessage, isCancellationMessage } from './bharatshop-operator-router.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const uiRoot = join(root, 'machine-ui');
const HOST = '127.0.0.1';
const PORT = Number(process.env.BHARATSHOP_MACHINE_UI_PORT || '3001');
const MODEL = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || process.env.AI_TEXT_MODEL || 'qwen3.5:4b';
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const SHIM_BASE_URL = String(process.env.AI_BASE_URL || 'http://127.0.0.1:11555').replace(/\/+$/, '');
const CONTEXT = Math.max(2048, Number(process.env.PERSONAL_AI_CONTEXT || '4096'));
const BODY_LIMIT = 12_000_000;
const stateHome = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const pendingDir = join(stateHome, 'pending');
const runningDir = join(stateHome, 'running');
const resultsDir = join(stateHome, 'results');
const heartbeatFile = join(stateHome, 'heartbeat.json');
const pendingApprovalFile = join(stateHome, 'pending-approval.json');
const personalMemoryScript = join(root, 'scripts', 'personal-ai-memory.mjs');

for (const dir of [stateHome, pendingDir, runningDir, resultsDir]) mkdirSync(dir, { recursive: true });

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function normalizeRoute(value) {
  return String(value || '').trim().toLowerCase() === 'agency' ? 'agency' : 'chat';
}

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  return origin === `http://127.0.0.1:${PORT}` || origin === `http://localhost:${PORT}`;
}

export function isLoopbackHost(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  return host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}`;
}

function securityHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, securityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  }));
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: String(message || 'error').slice(0, 800) });
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function fetchJson(url, options = {}, timeoutMs = 8_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return data;
}

async function getAgents() {
  const { discoverAgents } = await import('./local-agency.mjs');
  return discoverAgents();
}

async function getModels() {
  const data = await fetchJson(`${OLLAMA_BASE_URL}/api/tags`, {}, 5_000);
  return Array.isArray(data?.models) ? data.models.map(item => item?.name || item?.model).filter(Boolean) : [];
}

function safeReadJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function listJson(dir, limit = 30) {
  try {
    return readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit)
      .map(name => safeReadJson(join(dir, name)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fixedGit(args, fallback = '') {
  try {
    return String(execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 4_000 }) || '').trim();
  } catch {
    return fallback;
  }
}

function projectStatus() {
  const porcelain = fixedGit(['status', '--porcelain']);
  return {
    root,
    branch: fixedGit(['branch', '--show-current'], 'unknown'),
    head: fixedGit(['log', '-1', '--pretty=%h %s'], 'unknown'),
    remote: fixedGit(['remote', 'get-url', 'origin'], ''),
    dirtyFiles: porcelain ? porcelain.split(/\r?\n/).filter(Boolean).length : 0,
    changes: porcelain ? porcelain.split(/\r?\n/).filter(Boolean).slice(0, 30) : [],
  };
}

function memoryStatus() {
  if (!existsSync(personalMemoryScript)) return { available: false, error: 'memory script missing' };
  const result = spawnSync(process.execPath, [personalMemoryScript, 'status'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.status !== 0) return { available: false, error: String(result.stderr || 'memory status failed').trim() };
  try { return { available: true, stores: JSON.parse(result.stdout) }; } catch { return { available: false, error: 'memory status was not valid JSON' }; }
}

function memoryAction(action, type, content) {
  if (!existsSync(personalMemoryScript)) throw new Error('memory script missing');
  const args = [personalMemoryScript];
  if (action === 'remember') {
    if (!['working', 'episodic', 'semantic', 'personal'].includes(type)) throw new Error('invalid memory type');
    const text = String(content || '').trim();
    if (!text) throw new Error('memory text is empty');
    if (text.length > 20_000) throw new Error('memory text is too long');
    args.push('remember', type, text);
  } else if (action === 'clear-working') {
    args.push('clear-working');
  } else {
    throw new Error('unsupported memory action');
  }
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 8_000 });
  if (result.status !== 0) throw new Error(String(result.stderr || 'memory action failed').trim());
  return String(result.stdout || '').trim();
}

function taskStatus() {
  return {
    pending: listJson(pendingDir),
    running: listJson(runningDir),
    completed: listJson(resultsDir),
  };
}

function queueTask(task, route = 'chat') {
  const text = String(task || '').trim();
  if (!text) throw new Error('task text is empty');
  if (text.length > 200_000) throw new Error('task text is too long');
  const normalized = normalizeRoute(route);
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const payload = { id, createdAt: new Date().toISOString(), task: text, route: normalized, source: 'machine-web-ui' };
  writeFileSync(join(pendingDir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

async function runtimeStatus() {
  let models = [];
  let ollama = false;
  let shim = false;
  let agents = [];
  try { models = await getModels(); ollama = true; } catch {}
  try { const health = await fetchJson(`${SHIM_BASE_URL}/health`, {}, 5_000); shim = health?.ok === true; } catch {}
  try { agents = await getAgents(); } catch {}
  return {
    ok: ollama && models.includes(MODEL),
    model: MODEL,
    ollama: { ready: ollama, url: OLLAMA_BASE_URL, modelInstalled: models.includes(MODEL), models },
    shim: { ready: shim, url: SHIM_BASE_URL },
    agents: agents.length,
    supervisor: safeReadJson(heartbeatFile),
    project: projectStatus(),
  };
}

function chooseAgents(agents, task, requested = []) { return chooseDepartmentAgents(agents, task, requested); }

function loadPendingApproval(){const x=safeReadJson(pendingApprovalFile);return x?.status==='NEEDS_APPROVAL'?x:null} function savePendingApproval(task,mode,answer){const x={task:String(task||'').trim(),mode:normalizeRoute(mode),requestedAction:String(answer||'').slice(0,3000),createdAt:new Date().toISOString(),status:'NEEDS_APPROVAL'};writeFileSync(pendingApprovalFile,JSON.stringify(x,null,2),'utf8');return x} function clearPendingApproval(){rmSync(pendingApprovalFile,{force:true})} function asksForApproval(a){return /(approval required|requires? (?:your )?approval|please approve|if you approve|confirmation required|confirm before|approval-gated action|approve (?:this|the))/i.test(String(a||''))}

function normalizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .filter(item => item && ['user', 'assistant'].includes(item.role))
    .slice(-16)
    .map(item => {
      const content = String(item.content || '').slice(0, 250_000);
      const images = Array.isArray(item.images)
        ? item.images.filter(x => typeof x === 'string' && x.length < 6_000_000).slice(0, 3)
        : [];
      return images.length ? { role: item.role, content, images } : { role: item.role, content };
    });
}

function directSystemPrompt(installedModels = []) {
  return `You are the user's private BharatShop laptop AI running locally through Ollama. Your exact active model is ${MODEL}. Ollama endpoint is ${OLLAMA_BASE_URL}. The currently installed Ollama model names, which you must reproduce exactly if referenced, are: ${installedModels.join(', ') || MODEL}. The active local model is ${MODEL}; a model name ending in :cloud is only listed by Ollama and is not active unless explicitly selected. This local web UI provides direct chat and explicit agency specialist reasoning. The broader BharatShop laptop stack has separate approval-gated browser, coding, company and external-provider tools, so never claim those capabilities do not exist. Do not claim all laptop data can never leave the machine: local Qwen inference uses loopback, while separately invoked external connectors may transmit data. Never invent completed external actions. Never request secrets. Be practical and concise.`;
}

async function ollamaChat(systemPrompt, messages, { stream = false } = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream,
      think: false,
      messages: [{ role: 'system', content: systemPrompt }, ...normalizeMessages(messages)],
      options: { num_ctx: CONTEXT },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  return response;
}

async function nonStreamingChat(systemPrompt, messages) {
  const response = await ollamaChat(systemPrompt, messages, { stream: false });
  const data = await response.json();
  return String(data?.message?.content || '').trim();
}

function writeEvent(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

async function streamOllamaResponse(res,response){if(!response.body)throw new Error('Ollama returned no response body');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',full='';while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});while(true){const n=buffer.indexOf('\n');if(n<0)break;const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);if(!line)continue;let p;try{p=JSON.parse(line)}catch{continue}const t=String(p?.message?.content||'');if(t){full+=t;writeEvent(res,{type:'delta',text:t})}if(p?.done)writeEvent(res,{type:'meta',totalDuration:p.total_duration||null})}}const tail=buffer.trim();if(tail)try{const p=JSON.parse(tail),t=String(p?.message?.content||'');if(t){full+=t;writeEvent(res,{type:'delta',text:t})}}catch{}return full}

async function handleDirectChat(res, messages) {
  const installed = await getModels();
  const response = await ollamaChat(directSystemPrompt(installed), messages, { stream: true });
  return streamOllamaResponse(res, response);
}

async function handleAgencyChat(res, messages, selectedSlugs) {
  const agents = await getAgents();
  if (!agents.length) throw new Error('Agency catalog is not installed. Run npm.cmd run agency:setup first.');
  const task = String(messages.at(-1)?.content || '').trim();
  if (!task) throw new Error('Agency task is empty');
  const selected = chooseDepartmentAgents(agents, task, selectedSlugs);
  writeEvent(res, { type: 'agency', departments: classifyDepartments(task), agents: selected.map(agent => ({ slug: agent.slug, name: agent.name, division: agent.division, operatorDomain: agent.operatorDomain || null })) });
  const reports = [];
  for (const agent of selected) {
    writeEvent(res, { type: 'status', text: `${agent.name} is workingâ€¦` });
    const answer = await nonStreamingChat(
      `${agent.content}\n\nLOCAL MACHINE MODE\nYou are a BharatShop specialist running only through local Ollama model ${MODEL}. Do not claim external actions were performed. Do not request secrets. Production changes, browser actions, publishing, payments and destructive actions are approval-gated.`,
      [{ role: 'user', content: task }],
    );
    reports.push({ name: agent.name, answer });
  }
  writeEvent(res, { type: 'status', text: 'Agency Manager is synthesizing the specialist reportsâ€¦' });
  const response = await ollamaChat(
    `You are the BharatShop local Agency Manager running through Ollama model ${MODEL}. Synthesize the specialist reports into one concise practical answer. Do not invent completed external actions. Do not request secrets.`,
    [{ role: 'user', content: `TASK:\n${task}\n\nREPORTS:\n${reports.map(item => `## ${item.name}\n${item.answer}`).join('\n\n')}` }],
    { stream: true },
  );
  return streamOllamaResponse(res, response);
}

async function handleChat(req,res){const body=await readJson(req);let mode=normalizeRoute(body.mode),messages=normalizeMessages(body.messages);if(!messages.length||messages.at(-1)?.role!=='user')throw new Error('A user message is required');const original=String(messages.at(-1)?.content||'').trim();let resumed=null;res.writeHead(200,securityHeaders({'content-type':'application/x-ndjson; charset=utf-8','transfer-encoding':'chunked'}));try{if(isCancellationMessage(original)){const p=loadPendingApproval();clearPendingApproval();writeEvent(res,{type:'delta',text:p?'Pending BharatShop action cancelled.':'There is no pending BharatShop approval to cancel.'});writeEvent(res,{type:'done'});return res.end()}if(isApprovalMessage(original)){resumed=loadPendingApproval();if(!resumed){writeEvent(res,{type:'delta',text:'There is no pending BharatShop action awaiting approval. Tell me the task you want approved.'});writeEvent(res,{type:'done'});return res.end()}mode=normalizeRoute(resumed.mode);messages=[...messages.slice(0,-1),{role:'user',content:`APPROVAL GRANTED. Resume the pending task, but never claim a file/browser/production/payment/deployment action unless a tool actually ran it.\n\nPENDING TASK:\n${resumed.task}`}];writeEvent(res,{type:'status',text:`Resuming approved task: ${resumed.task.slice(0,140)}`})}const task=resumed?.task||original;const answer=mode==='agency'?await handleAgencyChat(res,messages,body.selectedAgents):await handleDirectChat(res,messages);if(resumed)clearPendingApproval();else if(asksForApproval(answer)){savePendingApproval(task,mode,answer);writeEvent(res,{type:'approval',status:'NEEDS_APPROVAL',task})}writeEvent(res,{type:'done'})}catch(e){writeEvent(res,{type:'error',error:e instanceof Error?e.message:String(e)})}res.end()}

function serveStatic(req, res, pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!['index.html', 'app.js', 'styles.css'].includes(relative)) return false;
  const file = join(uiRoot, relative);
  if (!existsSync(file)) return false;
  const payload = readFileSync(file);
  res.writeHead(200, securityHeaders({
    'content-type': STATIC_TYPES[extname(file)] || 'application/octet-stream',
    'content-length': payload.length,
    'cache-control': 'no-cache',
  }));
  res.end(payload);
  return true;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!isLoopbackHost(req.headers.host)) return sendError(res, 403, 'loopback_only');
      if (!isAllowedOrigin(req.headers.origin)) return sendError(res, 403, 'origin_not_allowed');
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
      if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, await runtimeStatus());
      if (req.method === 'GET' && url.pathname === '/api/agents') {
        const agents = await getAgents();
        return sendJson(res, 200, { agents: agents.map(agent => ({ slug: agent.slug, shortSlug: agent.shortSlug, name: agent.name, description: agent.description, division: agent.division })) });
      }
      if (req.method === 'GET' && url.pathname === '/api/tasks') return sendJson(res, 200, taskStatus());
      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        const body = await readJson(req);
        return sendJson(res, 201, { ok: true, task: queueTask(body.task, body.route) });
      }
      if (req.method === 'GET' && url.pathname === '/api/project') return sendJson(res, 200, projectStatus());
      if (req.method === 'GET' && url.pathname === '/api/memory') return sendJson(res, 200, memoryStatus());
      if (req.method === 'POST' && url.pathname === '/api/memory') {
        const body = await readJson(req);
        const output = memoryAction(String(body.action || ''), String(body.type || ''), String(body.content || ''));
        return sendJson(res, 200, { ok: true, output, status: memoryStatus() });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') return await handleChat(req, res);
      return sendError(res, 404, 'not_found');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendError(res, message === 'request_too_large' ? 413 : 500, message);
    }
  });
}

function main() {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`BharatShop Machine AI UI listening on http://${HOST}:${PORT}`);
    console.log(`Model: ${MODEL}`);
    console.log('Loopback-only UI. Production/deploy/browser actions remain approval-gated outside this web server.');
  });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
