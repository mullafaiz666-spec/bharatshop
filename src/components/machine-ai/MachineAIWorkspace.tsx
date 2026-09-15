"use client";

import {
  Bot,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  FolderKanban,
  HardDrive,
  Menu,
  MessageSquarePlus,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./MachineAIWorkspace.module.css";

type RouteMode = "chat" | "agency";
type Drawer = "agents" | "tasks" | "memory" | null;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: RouteMode;
  agents?: Array<{ name: string; division: string }>;
  error?: boolean;
};

type Thread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type RuntimeStatus = {
  model: string;
  ollamaReady: boolean;
  modelInstalled: boolean;
  installedModels: string[];
  agents: number;
  divisions: number;
  externalTools: string;
  supervisor: { online: boolean; state: string; detail: string; updatedAt: string; pid: number | null };
  tasks: { pending: number; running: number; completed: number };
  memory: { enabled: boolean; entries: number; pathLabel: string };
};

type AgentItem = { slug: string; name: string; description: string; division: string };
type UploadItem = { id: string; name: string; type: string; size: number };
type MemoryItem = { at?: string; role?: string; route?: string; content?: string };
type TaskItem = {
  id?: string;
  state?: string;
  task?: string;
  route?: string;
  createdAt?: string;
  finishedAt?: string;
  ok?: boolean;
  output?: string;
  error?: string;
};

type TaskSnapshot = {
  counts: { pending: number; running: number; completed: number };
  items: TaskItem[];
};

const STORAGE_KEY = "bharatshop-machine-ai-chats-v1";

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyThread(): Thread {
  const now = new Date().toISOString();
  return { id: uid("chat"), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

function shortTitle(text: string) {
  const title = text.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
  return title.length > 44 ? `${title.slice(0, 41)}…` : title || "New chat";
}

function timeAgo(value?: string) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function InlineMarkup({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className={styles.inlineCode}>{part.slice(1, -1)}</code>;
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function TextLines({ text }: { text: string }) {
  return (
    <div className={styles.markdownText}>
      {text.split("\n").map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const className = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
          return <div className={className} key={index}><InlineMarkup text={heading[2]} /></div>;
        }
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) return <div className={styles.bullet} key={index}><span>•</span><div><InlineMarkup text={bullet[1]} /></div></div>;
        const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (ordered) return <div className={styles.bullet} key={index}><span>{ordered[1]}.</span><div><InlineMarkup text={ordered[2]} /></div></div>;
        if (/^>\s?/.test(line)) return <blockquote key={index}><InlineMarkup text={line.replace(/^>\s?/, "")} /></blockquote>;
        if (!line.trim()) return <div className={styles.blankLine} key={index} />;
        return <p key={index}><InlineMarkup text={line} /></p>;
      })}
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > cursor) blocks.push(<TextLines key={`text-${cursor}`} text={content.slice(cursor, match.index)} />);
    blocks.push(<CodeBlock key={`code-${match.index}`} language={match[1].trim()} code={match[2].replace(/\n$/, "")} />);
    cursor = regex.lastIndex;
  }
  if (cursor < content.length) blocks.push(<TextLines key={`text-${cursor}`} text={content.slice(cursor)} />);
  return <>{blocks.length ? blocks : <TextLines text={content} />}</>;
}

export default function MachineAIWorkspace() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [routeMode, setRouteMode] = useState<RouteMode>("chat");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tasks, setTasks] = useState<TaskSnapshot | null>(null);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [attachments, setAttachments] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Thread[];
      const initial = Array.isArray(parsed) && parsed.length ? parsed : [emptyThread()];
      setThreads(initial);
      setActiveId(initial[0].id);
    } catch {
      const initial = emptyThread();
      setThreads([initial]);
      setActiveId(initial.id);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, 50)));
  }, [threads, hydrated]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/machine-ai/status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Runtime status unavailable");
      setStatus(payload as RuntimeStatus);
      setStatusError("");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/machine-ai/tasks", { cache: "no-store" });
      if (response.ok) setTasks(await response.json() as TaskSnapshot);
    } catch {
      // The status chip already reports local runtime failures.
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    try {
      const response = await fetch("/api/machine-ai/memory", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { entries?: MemoryItem[] };
        setMemory(payload.entries || []);
      }
    } catch {
      // Keep the panel usable even when memory is temporarily unavailable.
    }
  }, []);

  const refreshAgents = useCallback(async (query = "") => {
    try {
      const response = await fetch(`/api/machine-ai/agents?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { agents?: AgentItem[] };
        setAgents(payload.agents || []);
      }
    } catch {
      // Status panel explains catalog availability.
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 10_000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  useEffect(() => {
    if (drawer === "tasks") void refreshTasks();
    if (drawer === "memory") void refreshMemory();
    if (drawer === "agents") void refreshAgents(agentQuery);
  }, [drawer, refreshTasks, refreshMemory, refreshAgents, agentQuery]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [threads, activeId, busy]);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeId) || threads[0], [threads, activeId]);

  function updateThread(threadId: string, mutate: (thread: Thread) => Thread) {
    setThreads((current) => current.map((thread) => thread.id === threadId ? mutate(thread) : thread));
  }

  function createChat() {
    const thread = emptyThread();
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setInput("");
    setAttachments([]);
    setSidebarOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }

  function deleteThread(threadId: string) {
    setThreads((current) => {
      const next = current.filter((thread) => thread.id !== threadId);
      if (next.length) {
        if (threadId === activeId) setActiveId(next[0].id);
        return next;
      }
      const replacement = emptyThread();
      setActiveId(replacement.id);
      return [replacement];
    });
  }

  async function streamAnswer(threadId: string, requestMessages: ChatMessage[], assistantId: string, attachmentIds: string[]) {
    const response = await fetch("/api/machine-ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        route: routeMode,
        attachmentIds,
        messages: requestMessages.map(({ role, content }) => ({ role, content })),
      }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `Local chat failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type?: string;
          content?: string;
          error?: string;
          agents?: Array<{ name: string; division: string }>;
        };
        if (event.type === "delta" && event.content) {
          updateThread(threadId, (thread) => ({
            ...thread,
            updatedAt: new Date().toISOString(),
            messages: thread.messages.map((message) => message.id === assistantId ? { ...message, content: `${message.content}${event.content}` } : message),
          }));
        }
        if (event.type === "agents" && event.agents) {
          updateThread(threadId, (thread) => ({
            ...thread,
            messages: thread.messages.map((message) => message.id === assistantId ? { ...message, agents: event.agents } : message),
          }));
        }
        if (event.type === "error") throw new Error(event.error || "Local AI stream failed");
      }
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || !activeThread) return;

    const threadId = activeThread.id;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: uid("user"), role: "user", content: text, route: routeMode };
    const assistantId = uid("assistant");
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", route: routeMode };
    const requestMessages = [...activeThread.messages, userMessage];
    const attachmentIds = attachments.map((item) => item.id);

    updateThread(threadId, (thread) => ({
      ...thread,
      title: thread.messages.length ? thread.title : shortTitle(text),
      updatedAt: now,
      messages: [...thread.messages, userMessage, assistantMessage],
    }));
    setInput("");
    setAttachments([]);
    setBusy(true);
    setNotice("");

    try {
      await streamAnswer(threadId, requestMessages, assistantId, attachmentIds);
      await refreshStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateThread(threadId, (thread) => ({
        ...thread,
        messages: thread.messages.map((item) => item.id === assistantId ? { ...item, error: true, content: item.content || `Local AI error: ${message}` } : item),
      }));
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function queueCurrentTask() {
    const task = input.trim();
    if (!task || busy) return;
    try {
      const response = await fetch("/api/machine-ai/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, route: routeMode }),
      });
      const payload = await response.json() as { error?: string; snapshot?: TaskSnapshot };
      if (!response.ok) throw new Error(payload.error || "Could not queue task");
      if (payload.snapshot) setTasks(payload.snapshot);
      setInput("");
      setNotice("Task queued for the 24×7 local supervisor.");
      setDrawer("tasks");
      await refreshStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, 5 - attachments.length));
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/machine-ai/upload", { method: "POST", body: form });
      const payload = await response.json() as { error?: string; uploads?: UploadItem[] };
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      setAttachments((current) => [...current, ...(payload.uploads || [])].slice(0, 5));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  async function clearMemory() {
    if (!window.confirm("Clear working Machine AI memory? A local backup will be created first.")) return;
    const response = await fetch("/api/machine-ai/memory", { method: "DELETE", headers: { "x-confirm-clear": "clear-working-memory" } });
    const payload = await response.json() as { error?: string; backup?: string; cleared?: number };
    if (!response.ok) {
      setNotice(payload.error || "Memory clear failed");
      return;
    }
    setNotice(`Cleared ${payload.cleared || 0} memory entries. Backup: ${payload.backup || "created"}.`);
    await refreshMemory();
    await refreshStatus();
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const ready = Boolean(status?.ollamaReady && status?.modelInstalled);
  const chatsByRecency = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandRow}>
          <div className={styles.brandMark}><Sparkles size={18} /></div>
          <div className={styles.brandCopy}>
            <strong>Machine AI</strong>
            <span>BharatShop local</span>
          </div>
          <button type="button" className={styles.mobileClose} onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button type="button" className={styles.newChat} onClick={createChat}>
          <MessageSquarePlus size={17} />
          <span>New chat</span>
        </button>

        <div className={styles.sidebarLabel}>Chats</div>
        <div className={styles.chatList}>
          {chatsByRecency.map((thread) => (
            <div key={thread.id} className={`${styles.chatRow} ${thread.id === activeId ? styles.chatRowActive : ""}`}>
              <button
                type="button"
                className={styles.chatSelect}
                onClick={() => { setActiveId(thread.id); setSidebarOpen(false); }}
              >
                <span className={styles.chatTitle}>{thread.title}</span>
                <span className={styles.chatMeta}>{timeAgo(thread.updatedAt)}</span>
              </button>
              <button type="button" className={styles.chatDelete} onClick={() => deleteThread(thread.id)} aria-label={`Delete ${thread.title}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.sidebarTool} onClick={() => setDrawer("agents")}>
            <Users size={17} />
            <span>Agents</span>
            <b>{status?.agents ?? "—"}</b>
          </button>
          <button type="button" className={styles.sidebarTool} onClick={() => setDrawer("memory")}>
            <Brain size={17} />
            <span>Memory</span>
            <b>{status?.memory.enabled ? "On" : "Off"}</b>
          </button>
          <div className={styles.localCard}>
            <div className={styles.localCardTop}>
              <span className={`${styles.statusDot} ${ready ? styles.dotReady : styles.dotDown}`} />
              <strong>{ready ? "Local AI ready" : "Local AI offline"}</strong>
            </div>
            <span>{status?.model || "qwen3.5:4b"}</span>
            <span>{status?.supervisor.online ? "24×7 supervisor active" : "Supervisor heartbeat unavailable"}</span>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <button type="button" className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={20} /></button>
            <div>
              <div className={styles.titleLine}>BharatShop Machine AI</div>
              <div className={styles.subtitleLine}>Private laptop workspace</div>
            </div>
          </div>
          <div className={styles.topActions}>
            <button type="button" className={styles.statusPill} onClick={() => void refreshStatus()} title={statusError || status?.supervisor.detail}>
              <span className={`${styles.statusDot} ${ready ? styles.dotReady : styles.dotDown}`} />
              <span>{ready ? "Local" : "Offline"}</span>
              <span className={styles.pillModel}>{status?.model || "qwen3.5:4b"}</span>
            </button>
            <button type="button" className={styles.iconAction} onClick={() => setDrawer("tasks")} title="Background tasks">
              <Clock3 size={18} />
              {(status?.tasks.pending || status?.tasks.running) ? <span className={styles.countBadge}>{(status?.tasks.pending || 0) + (status?.tasks.running || 0)}</span> : null}
            </button>
            <button type="button" className={styles.agentsAction} onClick={() => setDrawer("agents")}>
              <Users size={17} />
              <span>{status?.agents ?? "—"} agents</span>
            </button>
          </div>
        </header>

        <section className={styles.conversation}>
          {!activeThread?.messages.length ? (
            <div className={styles.emptyState}>
              <div className={styles.heroIcon}><Bot size={30} /></div>
              <h1>What should your Machine AI do?</h1>
              <p>Chat privately with local Qwen, call your specialist team, inspect memory, or queue safe work for the 24×7 supervisor.</p>
              <div className={styles.starterGrid}>
                <button type="button" onClick={() => setInput("Check BharatShop and tell me the highest-priority work to finish next.")}>
                  <FolderKanban size={18} /><span><strong>Project focus</strong><small>Prioritize BharatShop work</small></span><ChevronRight size={16} />
                </button>
                <button type="button" onClick={() => { setRouteMode("agency"); setInput("Use the specialist team to review our current sales and growth strategy."); }}>
                  <Users size={18} /><span><strong>Specialist team</strong><small>Route to local agents</small></span><ChevronRight size={16} />
                </button>
                <button type="button" onClick={() => setDrawer("tasks")}>
                  <Clock3 size={18} /><span><strong>24×7 queue</strong><small>See background work</small></span><ChevronRight size={16} />
                </button>
                <button type="button" onClick={() => setDrawer("memory")}>
                  <Brain size={18} /><span><strong>Local memory</strong><small>Review remembered context</small></span><ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.messageColumn}>
              {activeThread.messages.map((message) => (
                <article key={message.id} className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.assistantRow}`}>
                  {message.role === "assistant" ? <div className={styles.avatar}><Sparkles size={16} /></div> : null}
                  <div className={`${styles.messageBubble} ${message.error ? styles.errorBubble : ""}`}>
                    {message.role === "assistant" && message.agents?.length ? (
                      <div className={styles.agentStrip}>
                        <Users size={14} />
                        {message.agents.map((agent) => <span key={`${message.id}-${agent.name}`}>{agent.name}</span>)}
                      </div>
                    ) : null}
                    {message.content ? <MarkdownMessage content={message.content} /> : (
                      <div className={styles.thinking}><span /><span /><span />{message.route === "agency" ? "Specialists are working" : "Thinking locally"}</div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </section>

        <div className={styles.composerWrap}>
          {notice ? <div className={styles.notice}><span>{notice}</span><button type="button" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
          {attachments.length ? (
            <div className={styles.attachmentTray}>
              {attachments.map((item) => (
                <div className={styles.attachmentChip} key={item.id}>
                  <FileText size={15} />
                  <span><strong>{item.name}</strong><small>{formatBytes(item.size)}</small></span>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((file) => file.id !== item.id))}><X size={13} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <form className={styles.composer} onSubmit={(event) => void sendMessage(event)}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={routeMode === "agency" ? "Ask the specialist team…" : "Message your local Machine AI…"}
              rows={1}
              disabled={busy}
            />
            <div className={styles.composerBottom}>
              <div className={styles.composerTools}>
                <input ref={fileRef} type="file" multiple hidden onChange={(event) => void handleFiles(event)} />
                <button type="button" className={styles.toolButton} onClick={() => fileRef.current?.click()} disabled={uploading || attachments.length >= 5} title="Attach local file">
                  {uploading ? <RefreshCw size={17} className={styles.spin} /> : <Paperclip size={17} />}
                </button>
                <div className={styles.modeSwitch}>
                  <button type="button" className={routeMode === "chat" ? styles.modeActive : ""} onClick={() => setRouteMode("chat")}><Zap size={14} />Direct</button>
                  <button type="button" className={routeMode === "agency" ? styles.modeActive : ""} onClick={() => setRouteMode("agency")}><Users size={14} />Team</button>
                </div>
              </div>
              <div className={styles.sendTools}>
                <button type="button" className={styles.queueButton} onClick={() => void queueCurrentTask()} disabled={!input.trim() || busy} title="Queue for 24×7 supervisor"><Clock3 size={16} /><span>Queue</span></button>
                <button type="submit" className={styles.sendButton} disabled={!input.trim() || busy} aria-label="Send message"><Send size={17} /></button>
              </div>
            </div>
          </form>
          <div className={styles.composerFoot}>Local Qwen inference stays on loopback. External tools remain explicit and approval-gated.</div>
        </div>
      </main>

      {drawer ? <button type="button" className={styles.drawerScrim} aria-label="Close panel" onClick={() => setDrawer(null)} /> : null}
      <aside className={`${styles.drawer} ${drawer ? styles.drawerOpen : ""}`}>
        <div className={styles.drawerHeader}>
          <div>
            <strong>{drawer === "agents" ? "Specialist agents" : drawer === "tasks" ? "Background tasks" : "Local memory"}</strong>
            <span>{drawer === "agents" ? `${status?.agents ?? 0} specialists across ${status?.divisions ?? 0} divisions` : drawer === "tasks" ? "24×7 supervisor queue" : status?.memory.pathLabel || "Private working memory"}</span>
          </div>
          <button type="button" onClick={() => setDrawer(null)}><X size={18} /></button>
        </div>

        {drawer === "agents" ? (
          <div className={styles.drawerBody}>
            <label className={styles.searchBox}><Search size={16} /><input value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} placeholder="Search agents…" /></label>
            <div className={styles.agentList}>
              {agents.map((agent) => (
                <button type="button" key={agent.slug} onClick={() => { setRouteMode("agency"); setInput(`Use ${agent.name} and the best supporting specialists to help with: `); setDrawer(null); inputRef.current?.focus(); }}>
                  <div className={styles.agentAvatar}>{agent.name.slice(0, 1).toUpperCase()}</div>
                  <span><strong>{agent.name}</strong><small>{agent.division}</small><p>{agent.description || "Local BharatShop specialist"}</p></span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!agents.length ? <div className={styles.emptyPanel}>No local agents match this search.</div> : null}
            </div>
          </div>
        ) : null}

        {drawer === "tasks" ? (
          <div className={styles.drawerBody}>
            <div className={styles.statGrid}>
              <div><Clock3 size={17} /><span>Pending</span><strong>{tasks?.counts.pending ?? status?.tasks.pending ?? 0}</strong></div>
              <div><Cpu size={17} /><span>Running</span><strong>{tasks?.counts.running ?? status?.tasks.running ?? 0}</strong></div>
              <div><Check size={17} /><span>Done</span><strong>{tasks?.counts.completed ?? status?.tasks.completed ?? 0}</strong></div>
            </div>
            <button type="button" className={styles.refreshButton} onClick={() => void refreshTasks()}><RefreshCw size={15} />Refresh queue</button>
            <div className={styles.taskList}>
              {(tasks?.items || []).map((task, index) => (
                <div className={styles.taskCard} key={`${task.id || "task"}-${index}`}>
                  <div className={styles.taskTop}><span className={`${styles.taskState} ${task.state === "completed" ? styles.taskDone : task.state === "running" ? styles.taskRunning : ""}`}>{task.state || "task"}</span><small>{timeAgo(task.finishedAt || task.createdAt)}</small></div>
                  <strong>{task.task || "Queued local task"}</strong>
                  <span>{task.route || "chat"} route</span>
                  {task.error ? <p className={styles.taskError}>{task.error}</p> : null}
                  {task.output ? <details><summary>Result</summary><pre>{task.output.slice(0, 3500)}</pre></details> : null}
                </div>
              ))}
              {!tasks?.items?.length ? <div className={styles.emptyPanel}>No local background tasks yet.</div> : null}
            </div>
          </div>
        ) : null}

        {drawer === "memory" ? (
          <div className={styles.drawerBody}>
            <div className={styles.memorySummary}>
              <div className={styles.memoryIcon}><Database size={19} /></div>
              <div><strong>{status?.memory.enabled ? "Memory is enabled" : "Memory is disabled"}</strong><span>{memory.length} recent entries shown</span></div>
              <span className={`${styles.statusDot} ${status?.memory.enabled ? styles.dotReady : styles.dotDown}`} />
            </div>
            <div className={styles.memoryActions}>
              <button type="button" onClick={() => void refreshMemory()}><RefreshCw size={15} />Refresh</button>
              <button type="button" className={styles.dangerButton} onClick={() => void clearMemory()}><Trash2 size={15} />Clear working memory</button>
            </div>
            <div className={styles.memoryList}>
              {[...memory].reverse().map((item, index) => (
                <div className={styles.memoryCard} key={`${item.at || index}-${index}`}>
                  <div><strong>{item.role || "memory"}</strong><span>{item.route || "chat"} · {timeAgo(item.at)}</span></div>
                  <p>{item.content}</p>
                </div>
              ))}
              {!memory.length ? <div className={styles.emptyPanel}>No saved working memory entries.</div> : null}
            </div>
          </div>
        ) : null}

        <div className={styles.drawerFooter}>
          <div className={styles.projectLinksTitle}><ShieldCheck size={15} /> BharatShop controls</div>
          <a href="/dashboard/command-centre"><FolderKanban size={15} />Command Centre<ExternalLink size={13} /></a>
          <a href="/agents"><Users size={15} />Agent directory<ExternalLink size={13} /></a>
          <a href="/dashboard"><HardDrive size={15} />Admin dashboard<ExternalLink size={13} /></a>
        </div>
      </aside>
    </div>
  );
}
