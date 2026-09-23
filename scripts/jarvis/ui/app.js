'use strict';
const $ = id => document.getElementById(id);
const base = 'http://127.0.0.1:3002';
let key = '', connected = false, timer = null, jobs = [], recognition = null, polling = false;
function notice(text) { $('notice').textContent = text; }
function setConnected(value) {
  connected = value;
  $('connection').textContent = value ? 'Laptop connected' : 'Laptop disconnected';
  $('connection').classList.toggle('connected', value);
  $('run').disabled = $('refresh').disabled = $('disconnect').disabled = !value;
}
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { Authorization: 'Bearer ' + key, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error || 'Request failed'); e.approvalRequired = data.approvalRequired; throw e; }
  return data;
}
function disconnect(message = 'Disconnected. Running tasks continue on the laptop; reconnect to view or stop them.') {
  clearInterval(timer); timer = null; key = ''; $('key').value = ''; setConnected(false);
  $('runtime').textContent = 'Not connected'; notice(message);
}
$('connect').onclick = async () => {
  key = $('key').value.trim();
  if (!key) return notice('Paste the session key printed by the Jarvis connector.');
  $('connect').disabled = true;
  try {
    const health = await api('/api/health');
    if (health.service !== 'jarvis-machine-ai' || health.protocol !== 1) throw new Error('Unsupported connector');
    $('key').value = '';
    setConnected(true);
    $('root').textContent = health.root;
    $('model').textContent = `${health.model} · ${health.modelInstalled ? 'installed' : health.ollama ? 'not installed' : 'Ollama not responding'}`;
    $('runtime').textContent = health.workerPresent ? 'Machine AI worker found · execution not yet verified' : 'Machine AI worker missing';
    notice('Connected. Commands execute in the displayed BharatShop workspace.');
    await refresh(); clearInterval(timer); timer = setInterval(refresh, 2500);
  } catch (error) { disconnect('Could not connect: ' + error.message + '. Start the laptop connector and allow local-network access if prompted. The local Jarvis link in setup is a fallback.'); }
  finally { $('connect').disabled = false; }
};
$('disconnect').onclick = () => disconnect();
function render() {
  const container = $('jobs'); container.replaceChildren();
  if (!jobs.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Connected. Ready for your first command.'; container.append(empty); return; }
  for (const job of jobs) {
    const article = document.createElement('article'); article.className = 'job';
    const header = document.createElement('header'); const title = document.createElement('h3'); title.textContent = job.task;
    const status = document.createElement('span'); status.className = 'status'; status.textContent = job.status.replaceAll('_', ' ');
    header.append(title, status);
    const meta = document.createElement('p'); meta.textContent = `${job.route} · ${new Date(job.createdAt).toLocaleString()}${job.exitCode !== null ? ' · exit ' + job.exitCode : ''}`;
    const output = document.createElement('pre'); output.textContent = job.output || 'Waiting for worker output…';
    article.append(header, meta, output);
    if (job.status === 'running') { const stop = document.createElement('button'); stop.textContent = 'Stop task'; stop.onclick = () => stopTask(job.id); article.append(stop); }
    container.append(article);
  }
}
async function refresh() {
  if (!connected || polling) return;
  polling = true;
  try {
    const result = await api('/api/jobs');
    const previous = new Map(jobs.map(j => [j.id, j.status])); jobs = result.jobs; render();
    for (const job of jobs) if (previous.get(job.id) === 'running' && job.status !== 'running') {
      const message = job.status === 'worker_finished' ? `${job.route} worker finished. Review the output for verification.` : `${job.route} task ${job.status.replaceAll('_', ' ')}.`;
      notice(message);
      if ($('speak').checked && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(message));
    }
  } catch (error) { disconnect('Laptop connection lost. Task state is unknown. Reconnect to inspect it. ' + error.message); }
  finally { polling = false; }
}
$('refresh').onclick = refresh;
async function stopTask(id) {
  try { await api('/api/stop', { method: 'POST', body: JSON.stringify({ id }) }); notice('Stop requested. Actions already completed are not undone.'); await refresh(); }
  catch (e) { notice(e.message); }
}
async function submit() {
  if (!connected) return notice('Connect your laptop before running a command.');
  const text = $('task').value.trim().replace(/^jarvis[,\s]+/i, '');
  if (!text) return;
  if (/^(stop|cancel)( the)?( current)?( task)?[.!]?$/i.test(text)) {
    const active = jobs.find(j => j.status === 'running'); return active ? stopTask(active.id) : notice('No running task in this session.');
  }
  $('run').disabled = true;
  const payload = { text, mode: $('mode').value };
  try {
    let result;
    try { result = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }); }
    catch (error) {
      if (error.approvalRequired !== 'company') throw error;
      if (!window.confirm('Run one BharatShop company cycle? This invokes the existing company runtime and may operate connected services. Its production approval checks remain active.')) return notice('Company cycle was not started.');
      result = await api('/api/jobs', { method: 'POST', body: JSON.stringify({ ...payload, approveCompany: true }) });
    }
    notice(`Task accepted by your laptop · ${result.route}. Follow the output below.`);
    $('task').value = ''; await refresh();
  } catch (error) { notice(error.message); }
  finally { $('run').disabled = !connected; }
}
$('task-form').onsubmit = event => { event.preventDefault(); submit(); };
document.querySelectorAll('[data-command]').forEach(button => { button.onclick = () => { $('task').value = button.dataset.command; $('mode').value = 'auto'; $('task').focus(); }; });
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) { $('voice').disabled = true; $('voice').textContent = 'Voice unavailable'; $('voice').title = 'Use a browser with speech recognition support, or type your command.'; }
else {
  recognition = new SpeechRecognition(); recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.continuous = false;
  $('voice').onclick = () => { try { recognition.start(); } catch { recognition.stop(); } };
  recognition.onstart = () => { $('voice').textContent = 'Listening…'; notice('Listening. Say your command, or “Jarvis stop task”.'); };
  recognition.onend = () => { $('voice').textContent = 'Use voice'; };
  recognition.onerror = event => notice('Voice recognition: ' + event.error + '. You can type your command.');
  recognition.onresult = event => { $('task').value = event.results[0][0].transcript; if ($('voice-run').checked) submit(); else notice('Voice captured. Review the command, then press Run command.'); };
}
window.addEventListener('pagehide', () => { key = ''; clearInterval(timer); recognition?.stop(); });
