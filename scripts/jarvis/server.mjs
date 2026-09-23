import http from 'node:http';
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
  if (/\b(company cycle|run (the )?(company|employees|agents))\b/i.test(text)) return { route: 'company', task: text };
  if (/\b(verify|test|check)\b.*\b(build|bharatshop|project|types)\b/i.test(text)) return { route: 'verify', task: text };
  if (/\b(build|fix|implement|debug|refactor|code)\b/i.test(text)) return { route: 'build', task: text };
  if (/\b(browse|browser|search the web|open website)\b/i.test(text)) return { route: 'browser', task: text };
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
export function createJarvis({ root, token, port = 3002, run = spawn, model = process.env.PERSONAL_AI_MODEL || process.env.AGENCY_MODEL || 'qwen3.5:4b' }) {
  const jobs = new Map();
  let active = null;
  const local = `http://127.0.0.1:${port}`;
  const origins = new Set([local, SITE]);
  const authorized = req => {
    const value = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${token}`);
    return value.length === expected.length && timingSafeEqual(value, expected);
  };
  function snapshot(job) { const { child, timer, ...data } = job; return data; }
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
    const commands = job.route === 'verify' ? ['typecheck', 'build'].map(s => npmCommand(root, s)) : [commandFor(root, job.route, job.task)];
    let index = 0;
    const next = () => {
      const [command, args] = commands[index++];
      job.output += `\nStarting ${job.route === 'verify' ? (index === 1 ? 'typecheck' : 'build') : job.route} worker…\n`;
      const child = run(command, args, { cwd: root, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PERSONAL_AI_MODEL: model, PERSONAL_AI_MEMORY: 'false' } });
      job.child = child;
      let settled = false;
      const finish = (code, error) => {
        if (settled) return; settled = true;
        if (error) job.output += '\n' + redact(error.message);
        if (job.status === 'running' && code === 0 && index < commands.length) return next();
        clearTimeout(job.timer);
        if (job.status === 'running') job.status = code === 0 ? 'worker_finished' : 'failed';
        job.exitCode = code;
        job.finishedAt = new Date().toISOString();
        job.child = null;
        active = null;
      };
      for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => { job.output = (job.output + chunk.toString()).slice(-64000); });
      child.on('error', error => finish(null, error));
      child.on('close', code => finish(code));
    };
    try { next(); } catch (error) { clearTimeout(job.timer); active = null; job.status = 'failed'; job.output = redact(error.message); job.finishedAt = new Date().toISOString(); }
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
      let ollama = false, modelInstalled = false;
      try { const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) }); const data = await r.json(); ollama = r.ok; modelInstalled = ollama && data.models?.some(m => (m.name || m.model) === model) || false; } catch {}
      return reply(200, { service: 'jarvis-machine-ai', protocol: 1, root, model, ollama, modelInstalled, workerPresent: existsSync(join(root, 'scripts/personal-ai.mjs')), activeJob: active?.id || null, capabilities: ['chat', 'agency', 'build', 'browser', 'company', 'verify', 'status'], note: 'Connector health does not verify task execution or production integrations.' });
    }
    if (req.method === 'GET' && path === '/api/jobs') return reply(200, { jobs: [...jobs.values()].reverse().map(j => ({ ...snapshot(j), output: redact(j.output) })) });
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
        if (path !== '/api/jobs') return reply(404, { error: 'Not found' });
        if (active) return reply(409, { error: 'A task is running. Wait or stop it first.' });
        const text = typeof data.text === 'string' ? data.text.trim() : '';
        if (!text || text.length > 8000) return reply(400, { error: 'Enter a task of 1–8000 characters' });
        const { route, task } = classify(text, data.mode || 'auto');
        if (route === 'company' && data.approveCompany !== true) return reply(409, { error: 'Confirm this company cycle before execution', approvalRequired: 'company' });
        if (route !== 'verify') commandFor(root, route, task);
        if (jobs.size >= 50) jobs.delete(jobs.keys().next().value);
        const job = { id: randomUUID(), task, route, status: 'queued', output: '', createdAt: new Date().toISOString(), exitCode: null };
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
