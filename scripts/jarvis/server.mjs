import http from 'node:http';
import os from 'node:os';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SITE = 'https://jarvis-core-faiz.mullafaiz666.chatgpt.site';
const routes = new Set(['chat', 'agency', 'build', 'browser', 'company', 'verify', 'status']);
export function classify(text, selected = 'auto') {
  if (selected !== 'auto') {
    if (!routes.has(selected)) throw new Error('Unknown task mode');
    return { route: selected, task: text };
  }
  const explicit = text.match(/^\/(chat|agency|build|browser|company|verify|status)\b\s*(.*)$/is);
  if (explicit) return { route: explicit[1].toLowerCase(), task: explicit[2] || explicit[1] };
  if (/कंपनी.*चलाओ|एजेंट.*चलाओ/u.test(text)) return { route: 'company', task: text };
  if (/जाँच|जांच|परीक्षण/u.test(text)) return { route: 'verify', task: text };
  if (/ठीक करो|बनाओ|कोड|डिबग/u.test(text)) return { route: 'build', task: text };
  if (/ब्राउज़र|वेब.*खोज/u.test(text)) return { route: 'browser', task: text };
  if (/\b(company cycle|run (?:the )?(?:bharatshop\s+)?(?:company(?:\s+agents?)?|employees|agents)(?:\s+once)?)\b/i.test(text)) return { route: 'company', task: text };
  if (/\b(verify|test|check)\b.*\b(build|bharatshop|project|types)\b/i.test(text)) return { route: 'verify', task: text };
  if (/\b(build|fix|implement|debug|refactor|code)\b/i.test(text)) return { route: 'build', task: text };
  if (/\b(browse|browser|search the web|open (?:a )?(?:website|site|web page)|inspect (?:the )?(?:page|site))\b/i.test(text) || /\bopen\b[\s\S]{0,80}https?:\/\//i.test(text)) return { route: 'browser', task: text };
  if (/\b(status|health)\b/i.test(text)) return { route: 'status', task: text };
  return { route: 'chat', task: text };
}
export function redact(text) {
  return String(text).replace(/\b(Bearer\s+)\S+/gi, '$1[redacted]')
    .replace(/((?:password|secret|api[_-]?key|access[_-]?token|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[redacted]');
}
function npmCommand(root, script) {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  for (const dir of (process.env.PATH || process.env.Path || '').split(delimiter)) {
    if (!dir) continue;
    candidates.push(join(dir, 'node_modules/npm/bin/npm-cli.js'));
    if (process.platform !== 'win32' && existsSync(join(dir, 'npm'))) candidates.push(realpathSync(join(dir, 'npm')));
  }
  const cli = candidates.find(p => p && existsSync(p));
  if (!cli) throw new Error('npm CLI not found. Start Jarvis with npm exec -- node scripts/jarvis/server.mjs');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!pkg.scripts?.[script]) throw new Error(`This checkout has no ${script} script`);
  return [process.execPath, [cli, 'run', script]];
}
export function commandFor(root, route, task) {
  if (route === 'status') return [process.execPath, [join(root, 'scripts/personal-ai.mjs'), 'status']];
  if (!['chat', 'agency', 'build', 'browser', 'company'].includes(route)) throw new Error('Unsupported worker');
  if (/^--/.test(task.trim())) throw new Error('Task must be a sentence, not a command-line option');
  return [process.execPath, [join(root, 'scripts/personal-ai.mjs'), 'task', task, '--route', route, ...(['build', 'browser', 'company'].includes(route) ? ['--execute'] : [])]];
}
async function localModels() {
  const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error('Ollama is not responding');
  const data = await response.json();
  return (data.models || []).map(m => m.name || m.model).filter(n => typeof n === 'string');
}
export function createJarvis({ root, token, port = 3002, run = spawn, getModels = localModels, model = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'deepseek-coder-v2:16b' }) {
  const jobs = new Map();
  let active = null;
  const local = `http://127.0.0.1:${port}`;
  const origins = new Set([local, SITE]);
  const authorized = req => {
    const value = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${token}`);
    return value.length === expected.length && timingSafeEqual(value, expected);
  };
  function runtimeMeta(job) {
    const output = String(job.output || '');
    const gemini = output.match(/Provider:\s*Google Gemini\s*\(([^)]+)\)/i);
    if (gemini) return { provider: 'google-gemini', modelUsed: gemini[1] };
    const ollama = output.match(/Provider:\s*Ollama\s*\(([^)]+)\)/i);
    if (ollama) return { provider: 'ollama', modelUsed: ollama[1] };
    return { provider: null, modelUsed: null };
  }
  function snapshot(job) {
    const { child, timer, workerTask, ...data } = job;
    return { ...data, ...runtimeMeta(job) };
  }
  function chatTask(task) {
    const previous = [...jobs.values()].filter(j => j.route === 'chat' && j.status === 'worker_finished').slice(-3);
    if (!previous.length) return task;
    const turns = previous.map(j => `User: ${j.task.slice(0, 800)}\nAssistant (unverified earlier reply): ${redact(j.output).slice(-1400)}`).join('\n\n');
    return `Continue this conversation. Earlier assistant claims are unverified; do not claim a build, deployment, or integration works without actual evidence.\n\n${turns}\n\nUser: ${task}\nAssistant:`;
  }
  function stop(job, status) {
    if (job.status !== 'running') return;
    job.status = status;
    job.finishedAt = new Date().toISOString();
    clearTimeout(job.timer);
    if (job.child?.pid) {
      if (process.platform === 'win32') run('taskkill.exe', ['/PID', String(job.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-job.child.pid, 'SIGKILL'); } catch { job.child.kill('SIGKILL'); } }
    }
    // Keep the execution slot until the worker closes, preventing overlapping edits.
  }
  function start(job) {
    active = job;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.timer = setTimeout(() => stop(job, 'timed_out'), 30 * 60 * 1000);
    const labels = job.route === 'verify' ? ['typecheck', 'build-check'] : [job.route, ...(job.verifyAfter ? ['typecheck', 'build-check'] : [])];
    job.stages = labels.map(label => ({ label, status: 'pending' }));
    job.checksStatus = labels.includes('typecheck') ? 'pending' : 'not_requested';
    let index = 0;
    const next = () => {
      const stage = job.stages[index++];
      stage.status = 'running';
      stage.startedAt = new Date().toISOString();
      let settled = false;
      const finish = (code, error) => {
        if (settled) return; settled = true;
        stage.status = job.status !== 'running' ? job.status : code === 0 ? 'passed' : 'failed';
        stage.finishedAt = new Date().toISOString();
        stage.exitCode = code;
        if (error) job.output += '\n' + redact(error.message);
        if (job.status === 'running' && code === 0 && index < job.stages.length) return next();
        clearTimeout(job.timer);
        if (job.status === 'running') job.status = code === 0 ? 'worker_finished' : 'failed';
        if (job.checksStatus !== 'not_requested') job.checksStatus = job.stages.filter(s => ['typecheck', 'build-check'].includes(s.label)).every(s => s.status === 'passed') ? 'passed' : 'incomplete_or_failed';
        job.exitCode = code;
        job.finishedAt = new Date().toISOString();
        job.child = null;
        active = null;
      };
      try {
        const [command, args] = stage.label === 'typecheck' ? npmCommand(root, 'typecheck') : stage.label === 'build-check' ? npmCommand(root, 'build') : commandFor(root, job.route, job.workerTask || job.task);
        job.output += `\nStarting ${stage.label} worker…\n`;
        const workerEnv = {
          ...process.env,
          PERSONAL_AI_MODEL: job.model,
          PERSONAL_AI_CONTEXT: process.env.PERSONAL_AI_CONTEXT || '4096',
          PERSONAL_AI_MEMORY: 'false',
          JARVIS_CODING_MODEL: process.env.JARVIS_CODING_MODEL || 'deepseek-coder-v2:16b',
          JARVIS_FAST_MODEL: process.env.JARVIS_FAST_MODEL || 'qwen3.5:4b',
          JARVIS_TOOL_MODEL: process.env.JARVIS_TOOL_MODEL || 'functiongemma:270m',
          PERSONAL_AI_CHAT_PROVIDER: process.env.PERSONAL_AI_CHAT_PROVIDER || 'auto',
          PERSONAL_AI_GEMINI_MODEL: process.env.PERSONAL_AI_GEMINI_MODEL || 'gemini-3.5-flash',
        };
        if (job.route !== 'chat') {
          delete workerEnv.GEMINI_API_KEY;
          delete workerEnv.PERSONAL_AI_CHAT_PROVIDER;
          delete workerEnv.PERSONAL_AI_GEMINI_MODEL;
        }
        const child = run(command, args, { cwd: root, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: workerEnv });
        job.child = child;
        for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => { job.output = (job.output + chunk.toString()).slice(-64000); });
        child.on('error', error => finish(null, error));
        child.on('close', code => finish(code));
      } catch (error) { finish(null, error); }
    };
    next();
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { error: 'Use the loopback address printed by Jarvis' });
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return reply(403, { error: 'Origin denied' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204); return res.end();
    }
    const path = new URL(req.url, local).pathname;
    const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && assets[path]) {
      const [name, mime] = assets[path];
      res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' http://127.0.0.1:3002; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
      try { res.writeHead(200, { 'Content-Type': mime }); return res.end(readFileSync(join(HERE, 'ui', name))); } catch { return res.end('Jarvis UI files are missing. Reinstall the integration bundle.'); }
    }
    if (!authorized(req)) return reply(401, { error: 'Pair with the session key shown in your laptop terminal' });
    if (req.method === 'GET' && path === '/api/health') {
      let ollama = false, models = [];
      try { models = await getModels(); ollama = true; } catch {}
      return reply(200, {
        service: 'jarvis-machine-ai',
        protocol: 1,
        version: '2.1.0',
        root,
        model,
        models,
        ollama,
        modelInstalled: models.includes(model),
        workerPresent: existsSync(join(root, 'scripts/personal-ai.mjs')),
        activeJob: active?.id || null,
        routing: {
          chatProvider: process.env.PERSONAL_AI_CHAT_PROVIDER || 'auto',
          geminiModel: process.env.PERSONAL_AI_GEMINI_MODEL || 'gemini-3.5-flash',
          codingModel: process.env.JARVIS_CODING_MODEL || 'deepseek-coder-v2:16b',
          fastModel: process.env.JARVIS_FAST_MODEL || 'qwen3.5:4b',
          toolModel: process.env.JARVIS_TOOL_MODEL || 'functiongemma:270m',
          geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        },
        checkedAt: new Date().toISOString(),
        machine: { platform: process.platform, cpuCores: os.cpus().length, totalMemoryGB: +(os.totalmem() / 2**30).toFixed(1), freeMemoryGB: +(os.freemem() / 2**30).toFixed(1), connectorUptimeSeconds: Math.floor(process.uptime()) },
        capabilities: ['chat', 'agency', 'build', 'browser', 'company', 'verify', 'status'],
        note: 'Connector health does not verify task execution or production integrations.'
      });
    }
    if (req.method === 'GET' && path === '/api/jobs') return reply(200, { jobs: [...jobs.values()].reverse().map(j => ({ ...snapshot(j), output: redact(j.output) })) });
    if (req.method === 'GET' && path.startsWith('/api/jobs/')) {
      const id = decodeURIComponent(path.slice('/api/jobs/'.length));
      const job = jobs.get(id);
      if (!job) return reply(404, { error: 'Task not found' });
      return reply(200, { ...snapshot(job), output: redact(job.output) });
    }
    if (req.method === 'POST') {
      let body = '';
      try {
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16000) { reply(413, { error: 'Request too large' }); return; } }
        const data = JSON.parse(body || '{}');
        if (path === '/api/stop') {
          const job = jobs.get(data.id);
          if (!job) return reply(404, { error: 'Task not found' });
          stop(job, 'cancelled'); return reply(200, { id: job.id, status: job.status });
        }
        if (!['/api/jobs', '/api/preview'].includes(path)) return reply(404, { error: 'Not found' });
        if (path === '/api/jobs' && data.requestId && [...jobs.values()].some(j => j.requestId === data.requestId)) { const existing = [...jobs.values()].find(j => j.requestId === data.requestId); return reply(200, { ...snapshot(existing), output: redact(existing.output) }); }
        if (path === '/api/jobs' && active) return reply(409, { error: 'A task is running. Wait or stop it first.' });
        const text = typeof data.text === 'string' ? data.text.trim() : '';
        if (!text || text.length > 8000) return reply(400, { error: 'Enter a task of 1–8000 characters' });
        const { route, task } = classify(text, data.mode || 'auto');
        const verifyAfter = route === 'build' && data.verifyAfter === true;
        if (path === '/api/preview') return reply(200, { route, task, verifyAfter, stages: route === 'verify' ? ['typecheck', 'build-check'] : [route, ...(verifyAfter ? ['typecheck', 'build-check'] : [])], approvalRequired: route === 'company' ? 'company' : null, executed: false });
        if (route === 'company' && data.approveCompany !== true) return reply(409, { error: 'Confirm this company cycle before execution', approvalRequired: 'company' });
        if (route !== 'verify') commandFor(root, route, task);
        let chosenModel = model;
        if (data.model) {
          const installed = await getModels();
          if (!installed.includes(data.model)) return reply(400, { error: 'Choose an installed local model. No model was downloaded.' });
          chosenModel = data.model;
        }
        // Model discovery is asynchronous; recheck duplicate IDs and the execution slot.
        const duplicate = data.requestId && [...jobs.values()].find(j => j.requestId === data.requestId);
        if (duplicate) return reply(200, { ...snapshot(duplicate), output: redact(duplicate.output) });
        if (active) return reply(409, { error: 'A task is running. Wait or stop it first.' });
        if (jobs.size >= 50) jobs.delete(jobs.keys().next().value);
        const job = { id: randomUUID(), requestId: typeof data.requestId === 'string' ? data.requestId.slice(0,100) : null, model: chosenModel, verifyAfter, task, workerTask: route === 'chat' ? chatTask(task) : null, route, status: 'queued', output: '', createdAt: new Date().toISOString(), exitCode: null };
        jobs.set(job.id, job);
        try { start(job); } catch (error) { clearTimeout(job.timer); active = null; job.status = 'failed'; job.output = redact(error.message); }
        return reply(202, { ...snapshot(job), output: redact(job.output) });
      } catch (error) { return reply(400, { error: redact(error.message) }); }
    }
    reply(404, { error: 'Not found' });
  });
  return { server, close: () => { if (active) stop(active, 'cancelled'); server.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(HERE, '../..');
  if (!existsSync(join(root, 'scripts/personal-ai.mjs')) || !existsSync(join(root, 'package.json'))) {
    console.error('Install scripts/jarvis inside your existing BharatShop checkout. No project files were modified.'); process.exit(1);
  }
  const token = randomBytes(32).toString('hex');
  const app = createJarvis({ root, token });
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 3002 is already in use. Close the previous Jarvis session first.' : error.message); process.exitCode = 1; });
  app.server.listen(3002, '127.0.0.1', () => {
    console.log('\nJARVIS · BharatShop Machine AI\nOpen http://127.0.0.1:3002 or your Jarvis site.\nPairing key (this session only; paste into Jarvis on this laptop):\n' + token + '\nKeep this window open. Ctrl+C disconnects Jarvis.\nLocal build/browser tasks use your existing workers. Production approval gates remain active.');
  });
  process.on('SIGINT', () => { app.close(); });
  process.on('SIGTERM', () => { app.close(); });
}
