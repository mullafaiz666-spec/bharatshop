export default String.raw`import { useEffect, useMemo, useRef, useState } from "react";
import ControlCenterShell, { Status } from "@/components/control-center/ControlCenterShell";
import { useLocalMachine } from "@/hooks/useLocalMachine";
import { useMcpConnectors } from "@/hooks/useMcpConnectors";
import { useMachineControl } from "@/hooks/useMachineControl";

export const route = { path: "/", layout: "owner", access: "authenticated" };
export const nav = { label: "Chat", order: 10 };

const BASE = "http://127.0.0.1:3001";
const STORAGE_KEY = "bharatshop-copilot-chats-v3";

function makeId() {
  return globalThis.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function newThread() {
  const now = Date.now();
  return { id: makeId(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

function MessageBody({ content }) {
  const blocks = String(content || "").split(new RegExp(String.fromCharCode(96, 96, 96), "g"));
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-200">
      {blocks.map((block, index) => index % 2 ? (
        <pre key={index} className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-black/30 p-4 text-[12px] leading-6 text-slate-300"><code>{block.replace(/^\w+\n/, "")}</code></pre>
      ) : (
        <div key={index} className="whitespace-pre-wrap break-words">{block}</div>
      ))}
    </div>
  );
}

function dotTone(state) {
  return state === "VERIFIED" ? "bg-emerald-400" : state === "AUTH_REQUIRED" ? "bg-amber-400" : "bg-slate-600";
}

export default function Home() {
  const runtime = useLocalMachine("/api/machine-ai/status", 4000);
  const tasks = useLocalMachine("/api/machine-ai/tasks", 4000);
  const mcp = useMcpConnectors(60000);
  const control = useMachineControl();
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [routeMode, setRouteMode] = useState("chat");
  const [busy, setBusy] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const active = useMemo(() => threads.find(thread => thread.id === activeId), [threads, activeId]);
  const verified = mcp.connectors.filter(item => item.state === "VERIFIED").length;
  const machineReady = Boolean(runtime.data?.ollamaReady && runtime.data?.modelInstalled);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        setThreads(saved);
        setActiveId(saved[0].id);
      } else {
        const thread = newThread();
        setThreads([thread]);
        setActiveId(thread.id);
      }
    } catch {
      const thread = newThread();
      setThreads([thread]);
      setActiveId(thread.id);
    }
  }, []);

  useEffect(() => {
    if (threads.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages, busy]);

  function updateThread(threadId, updater) {
    setThreads(current => current.map(thread => thread.id === threadId ? updater(thread) : thread));
  }

  function startNew() {
    const thread = newThread();
    setThreads(current => [thread, ...current]);
    setActiveId(thread.id);
    setDraft("");
    setSelectedAgents([]);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function deleteThread(threadId) {
    setThreads(current => {
      const next = current.filter(thread => thread.id !== threadId);
      if (!next.length) {
        const replacement = newThread();
        setActiveId(replacement.id);
        return [replacement];
      }
      if (threadId === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  async function runControl(action, text) {
    const result = await control.run({ action, task: text, route: action === "queue" ? "agency" : "chat" });
    if (Array.isArray(result.selectedAgents)) setSelectedAgents(result.selectedAgents);
    if (result.execution === "queued" && result.queued?.id) return "Queued background run\nTask ID: " + result.queued.id + "\nOpen Runs to follow progress.";
    return result.answer || JSON.stringify(result, null, 2);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || !active || !machineReady) return;

    if (routeMode === "developer" || routeMode === "apper" || routeMode === "queue") {
      const threadId = active.id;
      const userMessage = { id: makeId(), role: "user", content: text };
      const assistantId = makeId();
      setDraft("");
      setBusy(true);
      updateThread(threadId, thread => ({
        ...thread,
        title: thread.messages.length ? thread.title : text.slice(0, 44),
        updatedAt: Date.now(),
        messages: [...thread.messages, userMessage, { id: assistantId, role: "assistant", content: "" }],
      }));
      try {
        const answer = await runControl(routeMode, text);
        updateThread(threadId, thread => ({ ...thread, updatedAt: Date.now(), messages: thread.messages.map(message => message.id === assistantId ? { ...message, content: answer } : message) }));
      } catch (err) {
        const answer = err instanceof Error ? err.message : String(err);
        updateThread(threadId, thread => ({ ...thread, messages: thread.messages.map(message => message.id === assistantId ? { ...message, content: "Control action failed.\n\n" + answer } : message) }));
      } finally {
        setBusy(false);
      }
      return;
    }

    const threadId = active.id;
    const userMessage = { id: makeId(), role: "user", content: text };
    const assistantId = makeId();
    const history = [...active.messages, userMessage];
    setDraft("");
    setBusy(true);
    setSelectedAgents([]);
    updateThread(threadId, thread => ({
      ...thread,
      title: thread.messages.length ? thread.title : text.slice(0, 44),
      updatedAt: Date.now(),
      messages: [...thread.messages, userMessage, { id: assistantId, role: "assistant", content: "" }],
    }));

    try {
      const response = await fetch(BASE + "/api/machine-ai/cockpit-chat", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ messages: history.map(item => ({ role: item.role, content: item.content })), route: routeMode === "agency" ? "agency" : "chat" }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Machine AI request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      while (true) {
        const packet = await reader.read();
        if (packet.done) break;
        buffer += decoder.decode(packet.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === "agents" && Array.isArray(event.agents)) setSelectedAgents(event.agents);
          if (event.type === "error") throw new Error(event.error || "Machine AI stream failed");
          if (event.type === "delta") {
            answer += String(event.content || "");
            const currentAnswer = answer;
            updateThread(threadId, thread => ({ ...thread, updatedAt: Date.now(), messages: thread.messages.map(message => message.id === assistantId ? { ...message, content: currentAnswer } : message) }));
          }
        }
      }
    } catch (err) {
      const answer = err instanceof Error ? err.message : String(err);
      updateThread(threadId, thread => ({ ...thread, messages: thread.messages.map(message => message.id === assistantId ? { ...message, content: "I could not complete that request.\n\n" + answer } : message) }));
    } finally {
      setBusy(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  return (
    <ControlCenterShell title="BharatShop Copilot">
      <div className="grid h-[calc(100vh-56px)] min-h-[680px] grid-cols-1 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
        <aside className="hidden border-r border-white/[0.06] bg-[#090c12]/70 p-3 xl:flex xl:flex-col">
          <button onClick={startNew} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-left text-sm font-bold text-white hover:bg-white/[0.055]">
            <span>＋ New chat</span><span className="text-[10px] text-slate-600">Ctrl N</span>
          </button>
          <div className="mt-4 px-2 text-[9px] font-black uppercase tracking-[.18em] text-slate-600">Conversations</div>
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(thread => (
              <div key={thread.id} className={"group flex items-center rounded-xl " + (thread.id === activeId ? "bg-white/[0.07]" : "hover:bg-white/[0.035]")}>
                <button onClick={() => setActiveId(thread.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left text-[13px] text-slate-400"><span className="block truncate">{thread.title}</span></button>
                <button onClick={() => deleteThread(thread.id)} className="mr-1 hidden rounded-lg px-2 py-1 text-[10px] text-slate-600 hover:bg-white/5 hover:text-slate-300 group-hover:block">×</button>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-5 text-slate-600">Chat history stays in this browser. Inference and operations run through the laptop.</div>
        </aside>

        <section className="flex min-w-0 flex-col bg-[#080b11]/55">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black text-white">{active?.title || "New chat"}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-600">
                <span className={"h-1.5 w-1.5 rounded-full " + (machineReady ? "bg-emerald-400" : "bg-rose-400")} />
                <span>{runtime.data?.model || "qwen3.5:4b"}</span><span>·</span><span>{runtime.data?.agents ?? "—"} specialists</span><span>·</span><span>{verified}/{mcp.connectors.length || 4} MCP verified</span>
              </div>
            </div>
            <button onClick={startNew} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 xl:hidden">New chat</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-8 sm:px-6">
              {!active?.messages?.length ? (
                <div className="my-auto py-12">
                  <div className="mx-auto max-w-2xl text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-xl text-indigo-300 shadow-[0_0_70px_rgba(99,102,241,.12)]">✦</div>
                    <h1 className="mt-5 text-3xl font-black tracking-[-.045em] text-white sm:text-4xl">What should BharatShop do?</h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">Chat with Qwen, dispatch specialist teams, inspect MCP, queue background work, or hand a build task to the autonomous developer.</p>
                  </div>
                  <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
                    {[
                      ["/audit", "Audit the local runtime + MCP"],
                      ["/mcp", "Show connector status"],
                      ["Review BharatShop and identify the highest-impact unfinished production blocker.", "Ask Qwen about the project"],
                      ["Use an agent team to inspect the current task queue and summarize what needs attention.", "Dispatch specialists"],
                    ].map(item => (
                      <button key={item[1]} onClick={() => { setDraft(item[0]); textareaRef.current?.focus(); }} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-indigo-400/25 hover:bg-indigo-500/[0.045]">
                        <div className="text-sm font-bold text-slate-200">{item[1]}</div><div className="mt-1 truncate text-xs text-slate-600">{item[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-8 pb-10">
                  {active.messages.map(message => (
                    <article key={message.id} className="flex gap-3 sm:gap-4">
                      <div className={"mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[11px] font-black " + (message.role === "user" ? "bg-white text-black" : "bg-indigo-500/15 text-indigo-300")}>{message.role === "user" ? "YOU" : "AI"}</div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="mb-1 text-[10px] font-black uppercase tracking-[.14em] text-slate-600">{message.role === "user" ? "You" : routeMode === "agency" ? "BharatShop Agency" : "BharatShop Copilot"}</div>
                        {message.content ? <MessageBody content={message.content} /> : <div className="flex gap-1 py-3 text-indigo-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" /></div>}
                      </div>
                    </article>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-white/[0.06] bg-[#080b11]/95 px-3 py-3 backdrop-blur-xl sm:px-5">
            <div className="mx-auto max-w-4xl">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {[
                  ["chat", "Chat"], ["agency", "Agent team"], ["queue", "Queue"], ["developer", "Developer"], ["apper", "App builder"]
                ].map(item => (
                  <button key={item[0]} onClick={() => setRouteMode(item[0])} disabled={busy} className={"rounded-lg px-3 py-1.5 text-[11px] font-bold transition " + (routeMode === item[0] ? "bg-white text-black" : "border border-white/[0.07] bg-white/[0.025] text-slate-500 hover:text-slate-200")}>{item[1]}</button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-[22px] border border-white/[0.09] bg-[#111620] p-2 shadow-[0_18px_60px_rgba(0,0,0,.35)] focus-within:border-indigo-400/30">
                <textarea ref={textareaRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} rows={1} placeholder={routeMode === "agency" ? "Give the specialist team a task…" : routeMode === "developer" ? "Tell the autonomous developer what to build or fix…" : routeMode === "apper" ? "Tell the app builder what to change…" : "Message BharatShop Copilot…"} className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-white outline-none placeholder:text-slate-700" />
                <button onClick={send} disabled={!draft.trim() || busy || !machineReady} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-slate-700">↑</button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-slate-700"><span>Enter to send · Shift+Enter newline · slash commands supported</span><span>{busy ? "working…" : machineReady ? "local runtime ready" : "runtime unavailable"}</span></div>
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-white/[0.06] bg-[#090c12]/70 p-4 xl:block">
          <div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Live control plane</div><button onClick={mcp.refresh} className="text-[10px] font-bold text-indigo-300">refresh</button></div>

          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Runtime</span><Status tone={machineReady ? "good" : "warn"}>{machineReady ? "online" : "offline"}</Status></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-black text-white">{tasks.data?.counts?.pending ?? "—"}</div><div className="text-[9px] uppercase text-slate-600">pending</div></div>
              <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-black text-white">{tasks.data?.counts?.running ?? "—"}</div><div className="text-[9px] uppercase text-slate-600">running</div></div>
              <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-black text-white">{tasks.data?.counts?.completed ?? "—"}</div><div className="text-[9px] uppercase text-slate-600">done</div></div>
            </div>
          </div>

          <div className="mt-4 text-[10px] font-black uppercase tracking-[.14em] text-slate-600">MCP connectors</div>
          <div className="mt-2 space-y-2">
            {(mcp.connectors.length ? mcp.connectors : [{name:"local",state:"CHECKING"},{name:"github",state:"CHECKING"},{name:"supabase",state:"CHECKING"},{name:"apper",state:"CHECKING"}]).map(item => (
              <div key={item.name} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-2"><span className={"h-2 w-2 rounded-full " + dotTone(item.state)} /><span className="flex-1 text-xs font-bold capitalize text-slate-300">{item.name}</span><span className="text-[9px] font-black text-slate-600">{item.state}</span></div>
                <div className="mt-1 text-[10px] text-slate-700">{typeof item.tools === "number" ? item.tools + " tools" : "status probe"}{item.blockedWriteTools ? " · " + item.blockedWriteTools + " guarded" : ""}</div>
              </div>
            ))}
          </div>

          {selectedAgents.length ? (
            <div className="mt-4"><div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-600">Selected specialists</div><div className="mt-2 space-y-2">{selectedAgents.slice(0, 5).map(agent => <div key={agent.slug || agent.name} className="rounded-xl border border-indigo-500/15 bg-indigo-500/[0.045] p-2.5"><div className="text-xs font-bold text-slate-300">{agent.name}</div><div className="mt-0.5 text-[9px] uppercase tracking-[.12em] text-indigo-300">{agent.division}</div></div>)}</div></div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-600">Quick commands</div>
            <div className="mt-2 grid gap-1.5">
              {["/audit", "/mcp", "/mcp tools all"].map(command => <button key={command} onClick={() => { setRouteMode("chat"); setDraft(command); textareaRef.current?.focus(); }} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-[11px] font-mono text-slate-400 hover:text-white">{command}</button>)}
            </div>
          </div>
        </aside>
      </div>
    </ControlCenterShell>
  );
}
`;
