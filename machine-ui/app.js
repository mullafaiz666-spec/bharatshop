const STORAGE_KEY = 'bharatshop-machine-ai-chats-v1';
const state = {
  chats: [],
  activeId: null,
  busy: false,
  attachments: [],
  selectedAgents: [],
  agents: [],
  status: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  chatList: $('chatList'), messages: $('messages'), chatTitle: $('chatTitle'), prompt: $('prompt'), composer: $('composer'), send: $('send'),
  newChat: $('newChat'), mode: $('mode'), fileInput: $('fileInput'), attachmentStrip: $('attachmentStrip'), localDot: $('localDot'), localText: $('localText'),
  supervisorDot: $('supervisorDot'), supervisorText: $('supervisorText'), modelText: $('modelText'), connectionBadge: $('connectionBadge'), agentCountText: $('agentCountText'),
  drawer: $('drawer'), drawerBackdrop: $('drawerBackdrop'), drawerTitle: $('drawerTitle'), drawerSubtitle: $('drawerSubtitle'), drawerContent: $('drawerContent'), closeDrawer: $('closeDrawer'),
  mobileSidebar: $('mobileSidebar'), sidebar: document.querySelector('.sidebar'),
};

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function nowIso() { return new Date().toISOString(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function safeJsonParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

function loadChats() {
  const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  state.chats = Array.isArray(saved) ? saved.slice(0, 30) : [];
  if (!state.chats.length) createChat();
  else state.activeId = state.chats[0].id;
}

function saveChats() {
  const compact = state.chats.slice(0, 30).map(chat => ({
    ...chat,
    messages: chat.messages.slice(-80).map(msg => ({ ...msg, images: undefined })),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
}

function activeChat() { return state.chats.find(chat => chat.id === state.activeId); }
function createChat() {
  const chat = { id: uid(), title: 'New chat', createdAt: nowIso(), updatedAt: nowIso(), messages: [] };
  state.chats.unshift(chat); state.activeId = chat.id; saveChats(); renderAll();
}

function titleFrom(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || 'New chat';
}

function markdown(input) {
  const raw = String(input || '').replace(/\r\n/g, '\n');
  const blocks = [];
  let text = raw.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const token = `@@CODE${blocks.length}@@`;
    blocks.push(`<pre><code data-lang="${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`);
    return token;
  });
  text = escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = text.split('\n');
  const out = [];
  let list = null;
  for (const line of lines) {
    if (/@@CODE\d+@@/.test(line.trim())) { if (list) { out.push(`</${list}>`); list = null; } out.push(line.trim()); continue; }
    const bullet = line.match(/^[-*] (.+)$/);
    const num = line.match(/^\d+\. (.+)$/);
    if (bullet || num) {
      const wanted = num ? 'ol' : 'ul';
      if (list !== wanted) { if (list) out.push(`</${list}>`); out.push(`<${wanted}>`); list = wanted; }
      out.push(`<li>${(bullet || num)[1]}</li>`); continue;
    }
    if (list) { out.push(`</${list}>`); list = null; }
    if (!line.trim()) out.push('');
    else if (/^<h[1-3]>/.test(line)) out.push(line);
    else out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list}>`);
  let html = out.join('\n');
  blocks.forEach((block, index) => { html = html.replace(`@@CODE${index}@@`, block); });
  return html;
}

function renderChatList() {
  els.chatList.innerHTML = '';
  state.chats.forEach(chat => {
    const btn = document.createElement('button');
    btn.className = `chat-item${chat.id === state.activeId ? ' active' : ''}`;
    btn.textContent = chat.title;
    btn.onclick = () => { state.activeId = chat.id; renderAll(); closeMobileSidebar(); };
    els.chatList.appendChild(btn);
  });
}

function messageHtml(msg) {
  const who = msg.role === 'user' ? 'You' : 'Machine AI';
  const avatar = msg.role === 'user' ? 'Y' : 'AI';
  const body = msg.streaming && !msg.content ? '<span class="thinking">Thinking locally…</span>' : markdown(msg.content);
  const meta = [msg.mode === 'agency' ? 'Agency' : null, msg.agents?.length ? msg.agents.map(a => a.name).join(' + ') : null, msg.status || null].filter(Boolean).join(' · ');
  const attachments = Array.isArray(msg.attachments) && msg.attachments.length ? `<div class="message-meta">Attached: ${msg.attachments.map(escapeHtml).join(', ')}</div>` : '';
  return `<article class="message ${msg.role}"><div class="avatar">${avatar}</div><div><div class="message-role">${who}</div><div class="message-body">${body}</div>${attachments}${meta ? `<div class="message-meta">${escapeHtml(meta)}</div>` : ''}</div></article>`;
}

function renderMessages() {
  const chat = activeChat();
  els.chatTitle.textContent = chat?.title || 'New chat';
  if (!chat || !chat.messages.length) {
    els.messages.innerHTML = `<div class="empty-state"><div class="empty-inner"><div class="empty-logo">B</div><h1>Your BharatShop Machine AI</h1><p>Private local chat with Qwen, explicit access to the specialist agency, task queue, memory controls and read-only project status.</p><div class="prompt-chips"><button class="prompt-chip">Check my BharatShop project status</button><button class="prompt-chip">Use agency to review a product idea</button><button class="prompt-chip">Explain what this local AI can do</button></div></div></div>`;
    document.querySelectorAll('.prompt-chip').forEach(btn => btn.onclick = () => { els.prompt.value = btn.textContent; autoSize(); els.prompt.focus(); });
    return;
  }
  els.messages.innerHTML = chat.messages.map(messageHtml).join('');
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderAll() { renderChatList(); renderMessages(); renderAttachments(); }
function autoSize() { els.prompt.style.height = 'auto'; els.prompt.style.height = `${Math.min(180, Math.max(38, els.prompt.scrollHeight))}px`; }

async function refreshStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const data = await response.json(); state.status = data;
    const good = Boolean(data?.ok);
    els.localDot.className = `dot ${good ? 'good' : 'bad'}`;
    els.localText.textContent = good ? 'Local AI online' : 'Local AI unavailable';
    const supervisorGood = data?.supervisor?.state === 'LOCAL_READY';
    els.supervisorDot.className = `dot ${supervisorGood ? 'good' : ''}`;
    els.supervisorText.textContent = supervisorGood ? 'Supervisor ready' : (data?.supervisor?.state || 'Supervisor status unknown');
    els.modelText.textContent = data?.model || 'qwen3.5:4b';
    els.connectionBadge.textContent = good ? 'LOCAL' : 'OFFLINE';
    els.agentCountText.textContent = `${data?.agents ?? 0} agents`;
  } catch {
    els.localDot.className = 'dot bad'; els.localText.textContent = 'UI API unavailable'; els.connectionBadge.textContent = 'OFFLINE';
  }
}

async function handleFiles(files) {
  for (const file of Array.from(files).slice(0, 6)) {
    if (file.size > 5_000_000) continue;
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      state.attachments.push({ name: file.name, type: 'image', base64, mime: file.type });
    } else {
      const text = await file.text();
      state.attachments.push({ name: file.name, type: 'text', text: text.slice(0, 200_000) });
    }
  }
  renderAttachments();
}

function renderAttachments() {
  const strip = els.attachmentStrip;
  strip.classList.toggle('hidden', !state.attachments.length);
  strip.innerHTML = '';
  state.attachments.forEach((item, index) => {
    const pill = document.createElement('div'); pill.className = 'attachment-pill';
    pill.innerHTML = `<span>${item.type === 'image' ? '▧' : '▤'} ${escapeHtml(item.name)}</span><button title="Remove">×</button>`;
    pill.querySelector('button').onclick = () => { state.attachments.splice(index, 1); renderAttachments(); };
    strip.appendChild(pill);
  });
}

function payloadMessages(chat) {
  return chat.messages.filter(msg => ['user', 'assistant'].includes(msg.role) && !msg.error).slice(-14).map(msg => ({
    role: msg.role,
    content: msg.content,
    images: msg.images || undefined,
  }));
}

async function submitPrompt(event) {
  event?.preventDefault();
  if (state.busy) { state.activeController?.abort(); return; }
  const chat = activeChat(); if (!chat) return;
  const typed = els.prompt.value.trim(); if (!typed && !state.attachments.length) return;
  let content = typed;
  const textAttachments = state.attachments.filter(x => x.type === 'text');
  if (textAttachments.length) content += `${content ? '\n\n' : ''}${textAttachments.map(x => `--- Attachment: ${x.name} ---\n${x.text}`).join('\n\n')}`;
  const images = state.attachments.filter(x => x.type === 'image').map(x => x.base64);
  const names = state.attachments.map(x => x.name);
  const mode = els.mode.value;
  const userMsg = { id: uid(), role: 'user', content: content || '[Image attachment]', createdAt: nowIso(), images, attachments: names, mode };
  chat.messages.push(userMsg);
  if (chat.messages.length === 1) chat.title = titleFrom(typed || names[0]);
  chat.updatedAt = nowIso();
  els.prompt.value = ''; autoSize(); state.attachments = []; renderAll(); saveChats();

  const aiMsg = { id: uid(), role: 'assistant', content: '', createdAt: nowIso(), streaming: true, mode, agents: [] };
  chat.messages.push(aiMsg); renderMessages();
  state.busy = true; state.activeController = new AbortController(); els.send.disabled = false; els.send.textContent = '?'; els.send.title = 'Stop';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, messages: payloadMessages(chat).slice(0, -1), selectedAgents: state.selectedAgents }),
      signal: state.activeController.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const idx = buffer.indexOf('\n'); if (idx < 0) break;
        const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1); if (!line) continue;
        const evt = safeJsonParse(line, null); if (!evt) continue;
        if (evt.type === 'delta') aiMsg.content += evt.text || '';
        else if (evt.type === 'status') aiMsg.status = evt.text || '';
        else if (evt.type === 'agency') aiMsg.agents = evt.agents || [];
        else if (evt.type === 'error') { aiMsg.error = true; aiMsg.content += `\n\nError: ${evt.error}`; }
        renderMessages();
      }
    }
  } catch (error) {
    aiMsg.error = true; aiMsg.content = `Could not reach the local Machine AI: ${error.message}`;
  } finally {
    aiMsg.streaming = false; aiMsg.status = ''; chat.updatedAt = nowIso(); state.busy = false; state.activeController = null; els.send.disabled = false; els.send.textContent = '?'; els.send.title = 'Send'; saveChats(); renderAll();
  }
}

function closeDrawer() { els.drawer.classList.remove('open'); els.drawer.setAttribute('aria-hidden','true'); els.drawerBackdrop.classList.add('hidden'); }
function openDrawerShell(title, subtitle) { els.drawerTitle.textContent = title; els.drawerSubtitle.textContent = subtitle; els.drawerContent.innerHTML = '<div class="panel-card"><p>Loading…</p></div>'; els.drawer.classList.add('open'); els.drawer.setAttribute('aria-hidden','false'); els.drawerBackdrop.classList.remove('hidden'); }

async function openAgents() {
  openDrawerShell('Specialist agents', 'Select up to 3, or let the agency route choose automatically.');
  try {
    const data = await (await fetch('/api/agents')).json(); state.agents = data.agents || [];
    renderAgentPanel('');
  } catch (e) { els.drawerContent.innerHTML = `<div class="panel-card"><p>${escapeHtml(e.message)}</p></div>`; }
}
function renderAgentPanel(filter) {
  const q = String(filter || '').toLowerCase();
  const rows = state.agents.filter(a => `${a.name} ${a.description} ${a.division}`.toLowerCase().includes(q)).slice(0, 264);
  els.drawerContent.innerHTML = `<input id="agentFilter" class="agent-filter" placeholder="Search agents…" value="${escapeHtml(filter)}"/><div class="panel-card"><p>${state.selectedAgents.length ? `${state.selectedAgents.length}/3 selected. Agency mode will use these specialists.` : 'No agents pinned. Agency mode will auto-select the best team.'}</p><div class="button-row"><button id="clearAgents" class="panel-button">Clear selection</button><button id="agencyMode" class="panel-button primary-action">Use Agency mode</button></div></div><div class="agent-list">${rows.map(a => `<label class="agent-row"><input type="checkbox" data-agent="${escapeHtml(a.slug)}" ${state.selectedAgents.includes(a.slug) ? 'checked' : ''}/><span><div class="agent-name">${escapeHtml(a.name)}</div><div class="agent-desc">${escapeHtml(a.description || '')}</div><span class="agent-division">${escapeHtml(a.division || 'General')}</span></span></label>`).join('')}</div>`;
  $('agentFilter').oninput = e => renderAgentPanel(e.target.value);
  $('clearAgents').onclick = () => { state.selectedAgents = []; renderAgentPanel(filter); };
  $('agencyMode').onclick = () => { els.mode.value = 'agency'; closeDrawer(); els.prompt.focus(); };
  els.drawerContent.querySelectorAll('[data-agent]').forEach(box => box.onchange = e => {
    const slug = e.target.dataset.agent;
    if (e.target.checked) {
      if (state.selectedAgents.length >= 3) { e.target.checked = false; return; }
      state.selectedAgents.push(slug);
    } else state.selectedAgents = state.selectedAgents.filter(x => x !== slug);
    renderAgentPanel(filter);
  });
}

async function openTasks() {
  openDrawerShell('Background tasks', 'Safe queue: chat and agency routes only.');
  try {
    const data = await (await fetch('/api/tasks', { cache: 'no-store' })).json();
    const chat = activeChat(); const draft = els.prompt.value.trim();
    const completed = (data.completed || []).slice(0, 8);
    els.drawerContent.innerHTML = `<div class="panel-card"><h3>Queue a local task</h3><p>Uses the existing 24×7 supervisor. File-changing, browser, company, paid-provider and deployment actions stay outside this queue.</p><textarea id="taskText" class="memory-input" rows="4" placeholder="Task…">${escapeHtml(draft)}</textarea><div class="button-row"><button id="queueChat" class="panel-button primary-action">Queue chat</button><button id="queueAgency" class="panel-button">Queue agency</button></div></div><div class="panel-card"><div class="kv"><span>Pending</span><span>${(data.pending || []).length}</span><span>Running</span><span>${(data.running || []).length}</span><span>Completed</span><span>${(data.completed || []).length}</span></div></div>${completed.map(t => `<div class="panel-card"><h3>${escapeHtml(t.task || t.id || 'Task')}</h3><p>${escapeHtml(t.ok === true ? 'Completed' : t.ok === false ? 'Failed' : 'Result')} · ${escapeHtml(t.finishedAt || t.createdAt || '')}</p>${t.output ? `<div class="task-output">${escapeHtml(String(t.output).slice(0,5000))}</div>` : ''}</div>`).join('')}`;
    async function queue(route) {
      const text = $('taskText').value.trim(); if (!text) return;
      const response = await fetch('/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ task:text, route }) });
      if (!response.ok) alert((await response.json()).error || 'Queue failed'); else openTasks();
    }
    $('queueChat').onclick = () => queue('chat'); $('queueAgency').onclick = () => queue('agency');
  } catch (e) { els.drawerContent.innerHTML = `<div class="panel-card"><p>${escapeHtml(e.message)}</p></div>`; }
}

async function openMemory() {
  openDrawerShell('Memory', 'Manage local BharatShop AI memory and browser conversation history.');
  try {
    const data = await (await fetch('/api/memory', { cache:'no-store' })).json();
    const stores = data.stores || {};
    els.drawerContent.innerHTML = `<div class="panel-card"><h3>Local memory stores</h3><div class="kv">${['working','episodic','semantic','personal'].map(k => `<span>${k}</span><span>${stores[k]?.entries ?? 0} entries</span>`).join('')}</div></div><div class="panel-card"><h3>Remember something</h3><select id="memoryType" class="agent-filter"><option value="working">Working</option><option value="episodic">Episodic</option><option value="semantic">Semantic</option><option value="personal">Personal</option></select><textarea id="memoryText" class="memory-input" rows="4" placeholder="Do not store passwords, tokens or secrets."></textarea><div class="button-row"><button id="rememberBtn" class="panel-button primary-action">Remember</button></div></div><div class="panel-card"><h3>Conversation history</h3><p>Chat history in this screen is stored only in this browser profile.</p><div class="button-row"><button id="clearChatHistory" class="panel-button danger">Clear browser chats</button><button id="clearWorking" class="panel-button danger">Clear working memory</button></div></div>`;
    $('rememberBtn').onclick = async () => {
      const content = $('memoryText').value.trim(); if (!content) return;
      const response = await fetch('/api/memory', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action:'remember', type:$('memoryType').value, content }) });
      const result = await response.json(); if (!response.ok) alert(result.error || 'Memory write failed'); else openMemory();
    };
    $('clearChatHistory').onclick = () => { if (!confirm('Clear all chat history stored in this browser?')) return; localStorage.removeItem(STORAGE_KEY); state.chats=[]; createChat(); closeDrawer(); };
    $('clearWorking').onclick = async () => { if (!confirm('Clear the local AI working-memory store?')) return; const response = await fetch('/api/memory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'clear-working'})}); if (!response.ok) alert((await response.json()).error || 'Failed'); else openMemory(); };
  } catch (e) { els.drawerContent.innerHTML = `<div class="panel-card"><p>${escapeHtml(e.message)}</p></div>`; }
}

async function openOperations() {
  openDrawerShell('Operations cockpit', 'Run safe local controls and verification without arbitrary shell or production actions.');
  try {
    const data = await (await fetch('/api/operations', { cache:'no-store' })).json();
    const jobs = data.jobs || [];
    const latest = jobs.slice(0, 8);
    els.drawerContent.innerHTML = `<div class="panel-card"><h3>Local runtimes</h3><p>Machine AI and Agency controls stay on this laptop.</p><div class="button-row"><button id="machineStatus" class="panel-button">Machine status</button><button id="machineStart" class="panel-button primary-action">Start Machine AI</button><button id="machineStop" class="panel-button danger">Stop Machine AI</button></div><div class="button-row"><button id="agencyStatus" class="panel-button">Agency status</button><button id="agencyStart" class="panel-button primary-action">Start Agency</button><button id="agencyStop" class="panel-button danger">Stop Agency</button></div></div><div class="panel-card"><h3>Verification</h3><p>Runs git diff check, TypeScript, integration tests, lint and production build with secret-bearing environment variables stripped.</p><div class="button-row"><button id="verifyLocal" class="panel-button primary-action">Run full verification</button><button id="engineerStatus" class="panel-button">Engineer status</button><button id="refreshOps" class="panel-button">Refresh</button></div></div><div class="panel-card"><h3>Machine Engineer</h3><p>Runs only on an isolated repair/fix/feature branch, refuses dirty starts and secrets, and cannot commit, push, merge or deploy.</p><textarea id="engineerTask" class="memory-input" rows="5" placeholder="Describe the BharatShop code task…"></textarea><div class="button-row"><button id="runEngineer" class="panel-button primary-action">Run engineering task</button></div></div><div class="panel-card"><h3>Recent jobs</h3>${latest.length ? latest.map(job => `<div class="task-output"><strong>${escapeHtml(job.kind || 'job')} · ${escapeHtml(job.status || 'unknown')}</strong>\n${escapeHtml(job.currentStep || job.task || job.finishedAt || job.createdAt || '')}</div>`).join('') : '<p>No cockpit jobs yet.</p>'}</div><div class="panel-card"><h3>Safety boundary</h3><p>No arbitrary shell, production database writes, payments, publishing or deployment are exposed here. Those remain separately approval-gated.</p></div>`;

    async function run(action, payload = {}, needsApproval = false) {
      if (needsApproval && !confirm('Run this local cockpit operation?')) return;
      const response = await fetch('/api/operations', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ action, approved: needsApproval, ...payload }) });
      const result = await response.json();
      if (!response.ok) { alert(result.error || 'Operation failed'); return; }
      if (result.result?.output) alert(result.result.output);
      await openOperations();
    }

    $('machineStatus').onclick = () => run('machine-status');
    $('machineStart').onclick = () => run('machine-start', {}, true);
    $('machineStop').onclick = () => run('machine-stop', {}, true);
    $('agencyStatus').onclick = () => run('agency-status');
    $('agencyStart').onclick = () => run('agency-start', {}, true);
    $('agencyStop').onclick = () => run('agency-stop', {}, true);
    $('verifyLocal').onclick = () => run('verify-local');
    $('engineerStatus').onclick = () => run('engineer-status');
    $('refreshOps').onclick = openOperations;
    $('runEngineer').onclick = () => {
      const task = $('engineerTask').value.trim();
      if (!task) return alert('Enter an engineering task first.');
      run('engineer-task', { task }, true);
    };
  } catch (e) { els.drawerContent.innerHTML = `<div class="panel-card"><p>${escapeHtml(e.message)}</p></div>`; }
}

async function openProject() {
  openDrawerShell('BharatShop project', 'Read-only project and runtime controls.');
  try {
    const [project, status] = await Promise.all([(await fetch('/api/project',{cache:'no-store'})).json(), (await fetch('/api/status',{cache:'no-store'})).json()]);
    const heartbeat = status.supervisor || {};
    els.drawerContent.innerHTML = `<div class="panel-card"><h3>Repository</h3><div class="kv"><span>Path</span><span>${escapeHtml(project.root)}</span><span>Branch</span><span>${escapeHtml(project.branch)}</span><span>HEAD</span><span>${escapeHtml(project.head)}</span><span>Uncommitted</span><span>${project.dirtyFiles}</span></div></div><div class="panel-card"><h3>Machine runtime</h3><div class="kv"><span>Ollama</span><span>${status.ollama?.ready ? 'READY' : 'OFFLINE'}</span><span>Qwen shim</span><span>${status.shim?.ready ? 'READY' : 'OFFLINE'}</span><span>Supervisor</span><span>${escapeHtml(heartbeat.state || 'unknown')}</span><span>Agents</span><span>${status.agents ?? 0}</span></div></div><div class="panel-card"><h3>Safety boundary</h3><p>This panel is deliberately read-only. Git writes, deploys, browser actions, publishing, payments and destructive changes remain approval-gated in the existing tooling layer.</p><div class="button-row"><button id="projectAsk" class="panel-button primary-action">Ask AI about BharatShop</button><button id="refreshProject" class="panel-button">Refresh</button></div></div>${project.changes?.length ? `<div class="panel-card"><h3>Working tree</h3><div class="task-output">${escapeHtml(project.changes.join('\n'))}</div></div>` : ''}`;
    $('refreshProject').onclick = openProject;
    $('projectAsk').onclick = () => { closeDrawer(); els.prompt.value = 'Review the current BharatShop project status and tell me the safest next engineering step.'; autoSize(); els.prompt.focus(); };
  } catch (e) { els.drawerContent.innerHTML = `<div class="panel-card"><p>${escapeHtml(e.message)}</p></div>`; }
}

function closeMobileSidebar() { els.sidebar.classList.remove('open'); }

document.querySelectorAll('[data-drawer]').forEach(btn => btn.onclick = () => ({ agents:openAgents, tasks:openTasks, memory:openMemory, operations:openOperations, project:openProject })[btn.dataset.drawer]?.());
els.closeDrawer.onclick = closeDrawer; els.drawerBackdrop.onclick = closeDrawer;
els.mobileSidebar.onclick = () => els.sidebar.classList.toggle('open');
els.newChat.onclick = createChat;
els.prompt.addEventListener('input', autoSize);
els.prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt(); } });
els.composer.addEventListener('submit', submitPrompt);
els.fileInput.addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

loadChats(); renderAll(); refreshStatus(); setInterval(refreshStatus, 15000); autoSize();
