#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.PERSONAL_AI_HOME || join(homedir(), '.bharatshop-ai');
const MEMORY_HOME = join(HOME, 'memory');
const TYPES = ['working', 'episodic', 'semantic', 'personal'];
const files = Object.fromEntries(TYPES.map(type => [type, join(MEMORY_HOME, `${type}.jsonl`)]));

mkdirSync(MEMORY_HOME, { recursive: true });

function safe(text) {
  return !/(password|passcode|private key|secret|api[_ -]?key|access[_ -]?token|bearer\s+[a-z0-9._-]+)/i.test(String(text || ''));
}

function read(type) {
  const file = files[type];
  if (!file || !existsSync(file)) return [];
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export function remember(type, content, meta = {}) {
  if (!TYPES.includes(type)) throw new Error(`Unknown memory type: ${type}`);
  if (!content || !safe(content)) return false;
  appendFileSync(files[type], `${JSON.stringify({ at: new Date().toISOString(), content, ...meta })}\n`, 'utf8');
  return true;
}

export function recall(type, limit = 8, query = '') {
  const rows = read(type);
  const q = String(query || '').toLowerCase().trim();
  const filtered = q ? rows.filter(row => String(row.content || '').toLowerCase().includes(q)) : rows;
  return filtered.slice(-Math.max(1, limit));
}

export function status() {
  return Object.fromEntries(TYPES.map(type => [type, { file: files[type], entries: read(type).length, ready: existsSync(files[type]) }]));
}

export function clearWorking() {
  writeFileSync(files.working, '', 'utf8');
}

function usage() {
  console.log(`Personal AI memory agent\n\nCommands:\n  status\n  clear-working\n  remember <working|episodic|semantic|personal> <text>\n  recall <working|episodic|semantic|personal> [query] [limit]\n`);
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function runCli() {
  const [command, type, ...rest] = process.argv.slice(2);
  if (!command) { usage(); return 0; }

  if (command === 'status') {
    console.log(JSON.stringify(status(), null, 2));
  } else if (command === 'clear-working') {
    clearWorking();
    console.log('working memory cleared');
  } else if (command === 'remember') {
    const content = rest.join(' ').trim();
    console.log(remember(type, content) ? `stored in ${type}` : 'not stored');
  } else if (command === 'recall') {
    const limitArg = rest.at(-1);
    const limit = /^\d+$/.test(limitArg || '') ? Number(rest.pop()) : 8;
    console.log(JSON.stringify(recall(type, limit, rest.join(' ')), null, 2));
  } else {
    usage();
    return 2;
  }
  return 0;
}

if (isDirectRun()) process.exitCode = runCli();
