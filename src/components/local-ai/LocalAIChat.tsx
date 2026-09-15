"use client";

import {
  Bot,
  CheckCircle2,
  Cpu,
  Menu,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

type RuntimeStatus = {
  ok: boolean;
  ollamaReady: boolean;
  endpoint: string;
  model: string;
  modelInstalled: boolean;
  models: string[];
  agents: number;
  inference: string;
  error?: string;
};

type Mode = "chat" | "agency";

const STORAGE_KEY = "bharatshop-local-ai-chats-v1";

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function freshThread(): Thread {
  const now = Date.now();
  return { id: id(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

function MessageBody({ content }: { content: string }) {
  const blocks = content.split(/```/g);
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-100">
      {blocks.map((block, index) =>
        index % 2 === 1 ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-[13px] leading-6 text-slate-200"
          >
            <code>{block.replace(/^\w+\n/, "")}</code>
          </pre>
        ) : (
          <div key={index} className="whitespace-pre-wrap break-words">
            {block}
          </div>
        ),
      )}
    </div>
  );
}

function Sidebar({
  threads,
  activeId,
  open,
  onClose,
  onNew,
  onSelect,
  onDelete,
}: {
  threads: Thread[];
  activeId: string;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {open && <button aria-label="Close sidebar" onClick={onClose} className="fixed inset-0 z-40 bg-black/60 lg:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-white/10 bg-[#111318] transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400">BharatShop</p>
            <h1 className="mt-1 text-lg font-black tracking-[-0.04em] text-white">Laptop AI</h1>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/5 lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="px-3">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.07]"
          >
            <MessageSquarePlus size={18} /> New chat
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Conversations</p>
          <div className="space-y-1">
            {threads
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((thread) => (
                <div
                  key={thread.id}
                  className={`group flex items-center rounded-xl pr-1 ${thread.id === activeId ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                >
                  <button
                    onClick={() => onSelect(thread.id)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left text-sm font-medium text-slate-300"
                  >
                    <span className="block truncate">{thread.title}</span>
                  </button>
                  <button
                    aria-label="Delete chat"
                    onClick={() => onDelete(thread.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="border-t border-white/10 p-4 text-xs text-slate-500">
          <div className="flex items-center gap-2"><Cpu size={14} /> Local-first interface</div>
          <p className="mt-2 leading-5">Chats stay in this browser. AI inference goes to your laptop&apos;s loopback Ollama endpoint.</p>
        </div>
      </aside>
    </>
  );
}

export default function LocalAIChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeId), [threads, activeId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Thread[]) : [];
      const valid = Array.isArray(saved) ? saved : [];
      if (valid.length) {
        setThreads(valid);
        setActiveId(valid[0].id);
      } else {
        const thread = freshThread();
        setThreads([thread]);
        setActiveId(thread.id);
      }
    } catch {
      const thread = freshThread();
      setThreads([thread]);
      setActiveId(thread.id);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  }, [threads, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThread?.messages, busy]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/local-ai/status", { cache: "no-store" });
        const data = (await response.json()) as RuntimeStatus & { error?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Local AI status unavailable");
        setStatus(data);
        setStatusError("");
      } catch (error) {
        if (cancelled) return;
        setStatus(null);
        setStatusError(error instanceof Error ? error.message : "Local AI status unavailable");
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function updateThread(threadId: string, updater: (thread: Thread) => Thread) {
    setThreads((current) => current.map((thread) => (thread.id === threadId ? updater(thread) : thread)));
  }

  function startNewThread() {
    const thread = freshThread();
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setDraft("");
    setSidebarOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function selectThread(threadId: string) {
    setActiveId(threadId);
    setSidebarOpen(false);
  }

  function deleteThread(threadId: string) {
    const remaining = threads.filter((thread) => thread.id !== threadId);
    if (!remaining.length) {
      const replacement = freshThread();
      setThreads([replacement]);
      setActiveId(replacement.id);
      return;
    }
    setThreads(remaining);
    if (threadId === activeId) setActiveId(remaining[0].id);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || !activeThread) return;

    const threadId = activeThread.id;
    const userMessage: Message = { id: id(), role: "user", content: text };
    const assistantId = id();
    const assistantMessage: Message = { id: assistantId, role: "assistant", content: "" };
    const history = [...activeThread.messages, userMessage];
    setDraft("");
    setBusy(true);

    updateThread(threadId, (thread) => ({
      ...thread,
      title: thread.messages.length ? thread.title : text.slice(0, 46) || "New chat",
      updatedAt: Date.now(),
      messages: [...thread.messages, userMessage, assistantMessage],
    }));

    try {
      if (mode === "agency") {
        const response = await fetch("/api/local-ai/agency", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task: text }),
        });
        const data = (await response.json()) as { ok?: boolean; answer?: string; team?: string[]; error?: string };
        if (!response.ok || !data.answer) throw new Error(data.error || "Agency request failed");
        const prefix = data.team?.length ? `Agency team: ${data.team.join(" + ")}\n\n` : "";
        updateThread(threadId, (thread) => ({
          ...thread,
          updatedAt: Date.now(),
          messages: thread.messages.map((message) =>
            message.id === assistantId ? { ...message, content: `${prefix}${data.answer}` } : message,
          ),
        }));
      } else {
        const response = await fetch("/api/local-ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Local AI request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          const currentAnswer = answer;
          updateThread(threadId, (thread) => ({
            ...thread,
            updatedAt: Date.now(),
            messages: thread.messages.map((message) =>
              message.id === assistantId ? { ...message, content: currentAnswer } : message,
            ),
          }));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local AI request failed";
      updateThread(threadId, (thread) => ({
        ...thread,
        updatedAt: Date.now(),
        messages: thread.messages.map((item) =>
          item.id === assistantId
            ? { ...item, content: `I could not complete that request.\n\n${message}` }
            : item,
        ),
      }));
    } finally {
      setBusy(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  const ready = Boolean(status?.ok && status.ollamaReady && status.modelInstalled);

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-[#0b0d10] text-white">
      <Sidebar
        threads={threads}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={startNewThread}
        onSelect={selectThread}
        onDelete={deleteThread}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b0d10]/95 px-3 backdrop-blur sm:px-5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-300 hover:bg-white/5 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-black tracking-[-0.02em]">{activeThread?.title || "Laptop AI"}</h2>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:inline-flex">
                private local
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
              {ready ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-rose-400" />}
              <span>{status?.model || "qwen3.5:4b"}</span>
              <span>•</span>
              <span>{status ? `${status.agents} agents` : statusError || "checking runtime"}</span>
            </div>
          </div>
          <button
            onClick={startNewThread}
            className="hidden h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-300 hover:bg-white/5 sm:flex"
          >
            <MessageSquarePlus size={16} /> New chat
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-8 sm:px-6 sm:py-10">
            {!activeThread?.messages.length ? (
              <div className="my-auto py-16 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_80px_rgba(52,211,153,0.08)]">
                  <Sparkles size={28} />
                </div>
                <h3 className="mt-6 text-3xl font-black tracking-[-0.05em] sm:text-4xl">How can your laptop AI help?</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                  Direct chat streams from local Ollama. Switch to Agency mode when you want multiple specialist agents to work on one task.
                </p>
                <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
                  {[
                    "Review the BharatShop code architecture",
                    "Plan the next storefront improvement",
                    "Explain the current local AI runtime",
                    "Use specialists to analyze a business task",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setDraft(prompt);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm font-medium leading-6 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-8">
                {activeThread.messages.map((message) => (
                  <article key={message.id} className="flex gap-3 sm:gap-4">
                    <div
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                        message.role === "user" ? "bg-white text-black" : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="mb-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {message.role === "user" ? "You" : mode === "agency" ? "BharatShop Agency" : "Laptop AI"}
                      </div>
                      {message.content ? (
                        <MessageBody content={message.content} />
                      ) : (
                        <div className="flex items-center gap-1 py-2 text-emerald-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#0b0d10] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <div className="mx-auto max-w-4xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <button
                  onClick={() => setMode("chat")}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    mode === "chat" ? "bg-white text-black" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Bot size={14} /> Chat
                </button>
                <button
                  onClick={() => setMode("agency")}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    mode === "agency" ? "bg-emerald-400 text-black" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Users size={14} /> Agency
                </button>
              </div>
              <div className={`hidden items-center gap-1.5 text-[11px] font-bold sm:flex ${ready ? "text-emerald-400" : "text-rose-400"}`}>
                {ready ? <CheckCircle2 size={13} /> : <WifiOff size={13} />}
                {ready ? "Ollama ready" : statusError || "Ollama unavailable"}
              </div>
            </div>

            <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-[#15181d] p-2 shadow-2xl shadow-black/20 focus-within:border-white/20">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={mode === "agency" ? "Give the specialist team a task…" : "Message your local AI…"}
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-white outline-none placeholder:text-slate-600"
              />
              <button
                onClick={() => void send()}
                disabled={!draft.trim() || busy || !ready}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-600"
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] leading-4 text-slate-600">
              Local Qwen inference uses 127.0.0.1. External connectors and production actions remain separate and approval-gated.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
