#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || 'C:/Users/faizm/bharatshop-harness');
const worker = join(root, 'scripts/personal-ai.mjs');
const adapter = join(root, 'scripts/jarvis/gemini-chat.mjs');
const adapterCommit = 'a577710623d896384fdf3bce5f7b2ba2b0d46445';
const adapterHash = 'ee1ec532038c806960444a180c3a2388c778c937b11ea19ab93bd984022ff116';
const oldPart = 'async function generalAnswer(task) {\n';
const newPart = `async function generalAnswer(task) {
  if (process.env.PERSONAL_AI_CHAT_PROVIDER === 'gemini') {
    const { geminiChat } = await import('./jarvis/gemini-chat.mjs');
    const model = process.env.PERSONAL_AI_GEMINI_MODEL || 'gemini-2.5-flash';
    const answer = await geminiChat(task, { model });
    return \`Provider: Google Gemini (\${model})\\n\${answer}\`;
  }
`;

async function main() {
  if (!existsSync(worker)) throw new Error('Personal AI worker missing. No files changed.');
  const source = readFileSync(worker, 'utf8');
  if (!source.includes(newPart) && source.split(oldPart).length !== 2) throw new Error('Local chat worker differs from expected version. No files changed.');
  const url = `https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/${adapterCommit}/scripts/jarvis/gemini-chat.mjs`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Adapter download failed (${response.status}). No files changed.`);
  const body = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(body).digest('hex') !== adapterHash) throw new Error('Adapter verification failed. No files changed.');
  if (existsSync(adapter) && createHash('sha256').update(readFileSync(adapter)).digest('hex') !== adapterHash) throw new Error('Local adapter is customized. No files changed.');
  const backup = join(process.env.LOCALAPPDATA || root, 'BharatShop', 'JarvisBackups', `gemini-${Date.now()}`);
  mkdirSync(backup, { recursive: true });
  copyFileSync(worker, join(backup, 'personal-ai.mjs'));
  const newAdapter = !existsSync(adapter);
  try {
    mkdirSync(join(root, 'scripts/jarvis'), { recursive: true });
    if (newAdapter) writeFileSync(adapter, body);
    if (!source.includes(newPart)) writeFileSync(worker, source.replace(oldPart, newPart));
    for (const path of [worker, adapter]) {
      const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (checked.status !== 0) throw new Error(`Syntax check failed for ${path}: ${checked.stderr}`);
    }
  } catch (error) {
    copyFileSync(join(backup, 'personal-ai.mjs'), worker);
    if (newAdapter && existsSync(adapter)) unlinkSync(adapter);
    throw error;
  }
  console.log('Optional Gemini chat adapter installed. Backup:', backup);
  console.log('Local DeepSeek remains the default. No hosted request was made.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
