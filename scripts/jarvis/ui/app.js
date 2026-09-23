'use strict';
const $ = id => document.getElementById(id);
const base = 'http://127.0.0.1:3002';
let key = '', connected = false, timer = null, jobs = [], recognition = null, polling = false, submitting = false, lastHealth = 0, connectorVersion = 1;
function notice(text) { $('notice').textContent = text; }
function setConnected(value) {
  connected = value;
  $('connection').textContent = value ? 'Laptop connected' : 'Laptop disconnected';
  $('connection').classList.toggle('connected', value);
  $('run').disabled = $('refresh').disabled = $('preview').disabled = $('disconnect').disabled = !value;
}
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { Authorization: 'Bearer ' + key, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error || 'Request failed'); e.approvalRequired = data.approvalRequired; throw e; }
  return data;
}
function disconnect(message = 'Disconnected. Running tasks continue on the laptop; reconnect to view or stop them.') {
  clearInterval(timer); timer = null; key = ''; $('key').value = ''; setConnected(false);
  $('runtime').textContent = 'Not connected'; $('ram').textContent = $('uptime').textContent = '—'; $('heartbeat').textContent = 'Disconnected · health is not current'; notice(message);
}
$('connect').onclick = async () => {
  const enteredKey = $('key').value.trim();
  if (!enteredKey && connected) return notice('Already connected. Disconnect first to pair another session.');
  key = enteredKey;
  if (!key) return notice('Paste the session key printed by the Jarvis connector.');
  $('connect').disabled = true;
  try {
    const health = await api('/api/health');
    if (health.service !== 'jarvis-machine-ai' || health.protocol !== 1) throw new Error('Unsupported connector');
    $('key').value = '';
    setConnected(true);
    showHealth(health);
    notice('Connected. Commands execute in the displayed BharatShop workspace.');
    await refresh(); clearInterval(timer); timer = setInterval(refresh, 2500);
  } catch (error) { disconnect('Could not connect: ' + error.message + '. Start the laptop connector and allow local-network access if prompted. The local Jarvis link in setup is a fallback.'); }
  finally { $('connect').disabled = false; }
};
$('disconnect').onclick = () => disconnect();
function showHealth(health) {
  lastHealth = Date.now(); connectorVersion = health.version ? 2 : 1;
  $('root').textContent = health.root;
  $('model').textContent = `${health.model} · ${health.modelInstalled ? 'installed' : health.ollama ? 'not installed' : 'Ollama not responding'}`;
  $('runtime').textContent = health.workerPresent ? `Connector ${health.version || '1.0'} · worker found, task verification required` : 'Machine AI worker missing';
  const selection = $('brain').value;
  $('brain').replaceChildren(new Option('Configured model', ''), ...(health.models || []).map(name => new Option(name, name)));
  if ([...$('brain').options].some(o => o.value === selection)) $('brain').value = selection;
  $('brain').disabled = $('verify-after').disabled = $('preview').disabled = connectorVersion < 2;
  if (health.machine) {
    $('ram').textContent = `${health.machine.freeMemoryGB} / ${health.machine.totalMemoryGB} GB`;
    $('uptime').textContent = Math.floor(health.machine.connectorUptimeSeconds / 60) + ' min';
  }
  $('heartbeat').textContent = connectorVersion < 2 ? 'Upgrade your laptop connector to unlock V2 controls.' : `Checked ${new Date(health.checkedAt).toLocaleTimeString()} · ${health.machine.cpuCores} CPU cores`;
}
function collectCommand() { return { text: $('task').value.trim().replace(/^(jarvis|जार्विस)[,\s]+/iu, ''), mode: $('mode').value, model: $('brain').value, verifyAfter: connectorVersion >= 2 && $('verify-after').checked }; }
$('preview').onclick = async () => {
  if (!connected) return;
  try {
    const plan = await api('/api/preview', { method: 'POST', body: JSON.stringify(collectCommand()) });
    $('plan').hidden = false;
    $('plan').textContent = `Plan only · nothing executed\n${plan.stages.join(' → ')}${plan.approvalRequired ? '\nCompany confirmation required before execution.' : ''}\nModel: ${$('brain').value || 'configured local model'}`;
  } catch (error) { notice(error.message); }
};
for (const id of ['task', 'mode', 'brain', 'verify-after']) $(id).addEventListener('input', () => { $('plan').hidden = true; });
function render() {
  const container = $('jobs'); container.replaceChildren();
  if (!jobs.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Connected. Ready for your first command.'; container.append(empty); return; }
  const search = $('task-search').value.toLowerCase();
  const filter = $('task-filter').value;
  const visible = jobs.filter(j => (j.task + ' ' + j.output).toLowerCase().includes(search) && (filter === 'all' || (filter === 'failed' ? ['failed', 'cancelled', 'timed_out'].includes(j.status) : j.status === filter)));
  if (!visible.length) { const p = document.createElement('p'); p.textContent = 'No tasks match your filters.'; container.append(p); }
  for (const job of visible) {
    const article = document.createElement('article'); article.className = 'job';
    const header = document.createElement('header'); const title = document.createElement('h3'); title.textContent = job.task;
    const status = document.createElement('span'); status.className = 'status'; status.textContent = job.status.replaceAll('_', ' ');
    header.append(title, status);
    const seconds = Math.max(0, Math.floor(((job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()) - new Date(job.startedAt || job.createdAt).getTime()) / 1000));
    const meta = document.createElement('p'); meta.textContent = `${job.route} · ${job.model || 'configured model'} · ${seconds}s · ${new Date(job.createdAt).toLocaleString()}${job.exitCode !== null ? ' · exit ' + job.exitCode : ''}`;
    const output = document.createElement('pre'); output.textContent = job.output || 'Waiting for worker output…';
    const stages = document.createElement('div'); stages.className = 'stages';
    for (const stage of job.stages || []) { const chip = document.createElement('span'); chip.className = stage.status; chip.textContent = `${stage.label}: ${stage.status}`; stages.append(chip); }
    article.append(header, meta, stages, output);
    const actions = document.createElement('div'); actions.className = 'job-actions';
    const copy = document.createElement('button'); copy.textContent = 'Copy output'; copy.onclick = async () => { try { await navigator.clipboard.writeText(job.output || ''); notice('Task output copied.'); } catch { notice('Clipboard unavailable. Select the output to copy it.'); } }; actions.append(copy);
    const reuse = document.createElement('button'); reuse.textContent = 'Reuse command'; reuse.onclick = () => { $('task').value = job.task; $('mode').value = job.route; $('task').focus(); $('plan').hidden = true; }; actions.append(reuse);
    article.append(actions);
    if (job.status === 'running') { const stop = document.createElement('button'); stop.textContent = 'Stop task'; stop.onclick = () => stopTask(job.id); article.append(stop); }
    container.append(article);
  }
}
async function refresh() {
  if (!connected || polling) return;
  polling = true;
  try {
    const result = await api('/api/jobs');
    if (Date.now() - lastHealth > 10000) showHealth(await api('/api/health'));
    const previous = new Map(jobs.map(j => [j.id, j.status])); jobs = result.jobs; render();
    for (const job of jobs) if (previous.get(job.id) === 'running' && job.status !== 'running') {
      const message = job.checksStatus === 'passed' ? 'Typecheck and build passed. Review the change and functional behavior.' : job.status === 'worker_finished' ? `${job.route} worker finished. Review the output for verification.` : `${job.route} task ${job.status.replaceAll('_', ' ')}.`;
      notice(message);
      if ($('speak').checked && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(message));
    }
  } catch (error) { disconnect('Laptop connection lost. Task state is unknown. Reconnect to inspect it. ' + error.message); }
  finally { polling = false; }
}
$('refresh').onclick = () => { lastHealth = 0; refresh(); };
$('task-search').oninput = render; $('task-filter').onchange = render;
async function stopTask(id) {
  try { await api('/api/stop', { method: 'POST', body: JSON.stringify({ id }) }); notice('Stop requested. Actions already completed are not undone.'); await refresh(); }
  catch (e) { notice(e.message); }
}
async function submit() {
  if (!connected) return notice('Connect your laptop before running a command.');
  if (submitting) return;
  const command = collectCommand();
  const text = command.text;
  if (!text) return;
  if (/^(रुको|बंद करो|टास्क रोको)$/u.test(text) || /^(stop|cancel)( the)?( current)?( task)?[.!]?$/i.test(text)) {
    const active = jobs.find(j => j.status === 'running'); return active ? stopTask(active.id) : notice('No running task in this session.');
  }
  submitting = true; $('run').disabled = true;
  const payload = { ...command, requestId: crypto.randomUUID() };
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
  finally { submitting = false; $('run').disabled = !connected; }
}
$('task-form').onsubmit = event => { event.preventDefault(); submit(); };
document.querySelectorAll('[data-command]').forEach(button => { button.onclick = () => { $('task').value = button.dataset.command; $('mode').value = 'auto'; $('task').focus(); }; });
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) { $('voice').disabled = true; $('voice').textContent = 'Voice unavailable'; $('voice').title = 'Use a browser with speech recognition support, or type your command.'; }
else {
  recognition = new SpeechRecognition(); recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.continuous = false;
  $('voice').onclick = () => { try { recognition.lang = $('voice-language').value; recognition.start(); } catch { recognition.stop(); } };
  recognition.onstart = () => { $('voice').textContent = 'Listening…'; notice('Listening. Say your command, or “Jarvis stop task”.'); };
  recognition.onend = () => { $('voice').textContent = 'Use voice'; };
  recognition.onerror = event => notice('Voice recognition: ' + event.error + '. You can type your command.');
  recognition.onresult = event => { $('task').value = event.results[0][0].transcript; if ($('voice-run').checked) submit(); else notice('Voice captured. Review the command, then press Run command.'); };
}
window.addEventListener('pagehide', () => { key = ''; clearInterval(timer); recognition?.stop(); });

document.addEventListener('keydown', event => { if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); submit(); } if (event.ctrlKey && event.shiftKey && event.code === 'Space') { event.preventDefault(); $('voice').click(); } });
