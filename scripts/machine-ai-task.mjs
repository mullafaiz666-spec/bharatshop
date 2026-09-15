#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const stateHome = process.env.BHARATSHOP_MACHINE_AI_HOME || join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'BharatShop', 'MachineAI');
const pendingDir = join(stateHome, 'pending');
mkdirSync(pendingDir, { recursive: true });

const argv = process.argv.slice(2);
let route = '';
const parts = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--route') {
    route = String(argv[i + 1] || '').trim().toLowerCase();
    i += 1;
    continue;
  }
  parts.push(argv[i]);
}

const task = parts.join(' ').trim();
if (!task) {
  console.error('Usage: npm.cmd run machine:task -- "task" [--route chat|agency]');
  process.exit(2);
}
if (route && !['chat', 'agency'].includes(route)) {
  console.error('Background machine tasks allow only chat or agency routes. File-changing/browser/company/paid-provider actions stay interactive and approval-gated.');
  process.exit(2);
}

const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const payload = {
  id,
  createdAt: new Date().toISOString(),
  task,
  route: route || null,
};
const file = join(pendingDir, `${id}.json`);
writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Queued local machine AI task: ${id}`);
console.log(`Route: ${route || 'automatic (safe execution remains approval-gated)'}`);
console.log(`Queue: ${pendingDir}`);
