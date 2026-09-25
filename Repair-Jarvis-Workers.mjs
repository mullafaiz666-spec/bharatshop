#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || 'C:/Users/faizm/bharatshop-harness');
const source = join(root, 'scripts/personal-ai.mjs');
const fallback = join(root, 'services/browser-use-local/read-only-fallback.py');
const revision = '2f136e6caa102c3ce1d46a3d98d32e6b635707cb';
const expected = '3b882b5c0fe02a9a8beae90a38685c8e200111111f6b3282bea5835bc48380b7';

function replaceExactlyOnce(text, oldPart, newPart, label) {
  if (text.includes(newPart)) return text;
  const occurrences = text.split(oldPart).length - 1;
  if (occurrences !== 1) throw new Error(`${label}: expected one recognizable block, found ${occurrences}. Nothing changed.`);
  return text.replace(oldPart, newPart);
}

export function patchPersonalAi(original) {
  let text = original;
  text = replaceExactlyOnce(text,
    "const BROWSER_RUNNER = join(ROOT, 'services', 'browser-use-local', 'runner.py');",
    "const BROWSER_RUNNER = join(ROOT, 'services', 'browser-use-local', 'runner.py');\nconst BROWSER_FALLBACK = join(ROOT, 'services', 'browser-use-local', 'read-only-fallback.py');",
    'fallback path');
  text = replaceExactlyOnce(text,
    "function capture(command, args = [], options = {}) {\n  return run(command, args, { ...options, stdio: 'pipe', quiet: true });\n}",
    "function capture(command, args = [], options = {}) {\n  return run(command, args, { ...options, stdio: 'pipe', quiet: true });\n}\n\nfunction localHarnessEnv() {\n  const names = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP', 'OLLAMA_HOST'];\n  return Object.fromEntries(names.filter(name => typeof process.env[name] === 'string').map(name => [name, process.env[name]]));\n}",
    'local Harness environment');
  text = replaceExactlyOnce(text,
    "  const result = run(ollama, ['launch', 'dsh', '--model', MODEL, '--', '--profile', 'headless', prompt]);",
    "  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');\n  if (!existsSync(npxCli)) throw new Error('The Node.js npx CLI is missing; repair the Node.js installation.');\n  const result = run(process.execPath, [npxCli, '--yes', '@deepseek-ai/dsh@0.1.5-rc.2', '--profile', 'headless', prompt], { env: localHarnessEnv() });",
    'coding Harness command');
  text = replaceExactlyOnce(text,
    '  if (result.status !== 0) throw new Error(`Browser worker stopped with exit code ${result.status}.`);',
    "  if (result.status !== 0) {\n    if (!/\\b(open|inspect|read|report|summarize)\\b/i.test(task) || !/https?:\\/\\/[^\\s]+/i.test(task) || !existsSync(BROWSER_FALLBACK)) throw new Error(`Browser worker stopped with exit code ${result.status}.`);\n    console.log('Browser Use failed. Trying a read-only Playwright inspection; no clicks or forms will run.');\n    const fallback = run(python, [BROWSER_FALLBACK, task]);\n    if (fallback.status !== 0) throw new Error(`Browser Use and read-only Playwright inspection both failed. Exit code ${fallback.status}.`);\n    return 'Read-only site inspection completed with Playwright. Browser Use actions remain unverified.';\n  }",
    'browser fallback');
  return text;
}

async function install() {
  if (!existsSync(source)) throw new Error('Personal AI worker is missing. Nothing changed.');
  const original = readFileSync(source, 'utf8');
  const patched = patchPersonalAi(original.replaceAll('\r\n', '\n'));
  const url = `https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/${revision}/services/browser-use-local/read-only-fallback.py`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Fallback download failed (${response.status}). Nothing changed.`);
  const body = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(body).digest('hex') !== expected) throw new Error('Fallback download hash mismatch. Nothing changed.');
  if (existsSync(fallback) && createHash('sha256').update(readFileSync(fallback)).digest('hex') !== expected) throw new Error('Local fallback is customized. Nothing changed.');

  const backup = join(process.env.LOCALAPPDATA || join(root, '.jarvis-backup'), 'BharatShop', 'JarvisBackups', `workers-${Date.now()}`);
  mkdirSync(backup, { recursive: true });
  copyFileSync(source, join(backup, 'personal-ai.mjs'));
  const newFallback = !existsSync(fallback);
  try {
    mkdirSync(join(root, 'services/browser-use-local'), { recursive: true });
    if (newFallback) writeFileSync(fallback, body);
    if (patched !== original.replaceAll('\r\n', '\n')) writeFileSync(source, patched);
    const check = spawnSync(process.execPath, ['--check', source], { cwd: root, encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`Updated worker did not parse: ${check.stderr || check.error?.message || 'unknown error'}`);
  } catch (error) {
    copyFileSync(join(backup, 'personal-ai.mjs'), source);
    if (newFallback && existsSync(fallback)) unlinkSync(fallback);
    throw error;
  }
  console.log('Jarvis coding command repaired and read-only browser fallback installed.');
  console.log('Backup:', backup);
  console.log('The open Jarvis connector can stay running; new tasks use these worker files.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) install().catch(error => { console.error(error.message); process.exitCode = 1; });
