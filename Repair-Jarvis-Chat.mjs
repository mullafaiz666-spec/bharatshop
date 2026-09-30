#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'C:/Users/faizm/bharatshop-harness');
const target = join(root, 'scripts/jarvis/server.mjs');
const oldChat = `  function chatTask(task) {
    const previous = [...jobs.values()].filter(j => j.route === 'chat' && j.status === 'worker_finished').slice(-3);
    if (!previous.length) return task;
    const turns = previous.map(j => \`User: \${j.task.slice(0, 800)}\\nAssistant (unverified earlier reply): \${redact(j.output).slice(-1400)}\`).join('\\n\\n');
    return \`Continue this conversation. Earlier assistant claims are unverified; do not claim a build, deployment, or integration works without actual evidence.\\n\\n\${turns}\\n\\nUser: \${task}\\nAssistant:\`;
  }`;
const newChat = `  function chatTask(task) {
    const previous = [...jobs.values()].filter(j => j.route === 'chat' && j.status === 'worker_finished').slice(-3);
    if (!previous.length) return task;
    const turns = previous.map(j => \`User: \${j.task.slice(0, 800)}\`).join('\\n');
    return \`Earlier user messages (assistant replies omitted because they are unverified):\\n\${turns}\\n\\nCurrent user message: \${task}\\nAnswer only the current message. If the earlier messages do not contain the requested fact, say you do not know. Do not invent previous conversation or completed actions.\`;
  }
  function lastQuestionAnswer(task) {
    if (!/^\\s*(?:what did i (?:just|last) ask(?: you)?|what was my (?:last|previous) (?:question|message))\\s*[?.!]*\\s*$/i.test(task)) return null;
    const previous = [...jobs.values()].filter(j => j.route === 'chat' && j.status === 'worker_finished').at(-1);
    return previous ? \`Your previous message here was: “\${previous.task.slice(0, 800)}”\` : 'I can see only this message in the current Jarvis conversation. You asked what you just asked me; I cannot verify an earlier question.';
  }`;
const oldJob = '        jobs.set(job.id, job);\n        try { start(job); }';
const newJob = `        jobs.set(job.id, job);
        const groundedReply = route === 'chat' ? lastQuestionAnswer(task) : null;
        if (groundedReply) {
          job.status = 'worker_finished'; job.output = groundedReply; job.exitCode = 0; job.finishedAt = new Date().toISOString();
          job.stages = [{ label: 'chat', status: 'passed', startedAt: job.createdAt, finishedAt: job.finishedAt, exitCode: 0 }];
          job.checksStatus = 'not_requested';
          return reply(202, { ...snapshot(job), output: job.output });
        }
        try { start(job); }`;
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) throw new Error(`${label}: local Jarvis differs from the expected version. No files changed.`);
  return source.replace(before, after);
}
if (!existsSync(target)) throw new Error('Jarvis server is missing. No files changed.');
const original = readFileSync(target, 'utf8');
let patched = replaceOnce(original, oldChat, newChat, 'chat history');
patched = replaceOnce(patched, oldJob, newJob, 'grounded chat reply');
if (patched === original) { console.log('Jarvis chat repair is already installed. Restart the connector to load it.'); process.exit(0); }
const backup = join(process.env.LOCALAPPDATA || root, 'BharatShop', 'JarvisBackups', `chat-${Date.now()}`);
mkdirSync(backup, { recursive: true });
copyFileSync(target, join(backup, 'server.mjs'));
try {
  writeFileSync(target, patched);
  const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr || 'Jarvis syntax check failed');
} catch (error) {
  copyFileSync(join(backup, 'server.mjs'), target);
  throw error;
}
console.log('Jarvis chat history repaired. Backup:', backup);
console.log('Restart the Jarvis connector to load this change.');
