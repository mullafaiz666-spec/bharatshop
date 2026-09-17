#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpRouter, redactText } from './mcp-router.mjs';

const execFileAsync = promisify(execFile);

async function hydrateGitHubAuth() {
  if (process.env.GITHUB_MCP_TOKEN) return { state: 'existing-env' };
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    const token = String(stdout || '').trim();
    if (!token) return { state: 'not-available' };
    process.env.GITHUB_MCP_TOKEN = token;
    return { state: 'loaded-from-gh' };
  } catch {
    return { state: 'not-available' };
  }
}

function hydrateSupabaseProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return { state: 'existing-env' };
  const candidates = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL].filter(Boolean);
  for (const value of candidates) {
    try {
      const host = new URL(value).hostname;
      const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      if (match) {
        process.env.SUPABASE_PROJECT_REF = match[1];
        return { state: 'derived-from-project-url' };
      }
    } catch {}
  }
  return { state: 'not-available' };
}

export async function hydrateMcpAuth() {
  const github = await hydrateGitHubAuth();
  const supabaseProject = hydrateSupabaseProjectRef();
  return {
    github: github.state,
    supabaseProject: supabaseProject.state,
    supabaseAccessToken: process.env.SUPABASE_ACCESS_TOKEN ? 'existing-env' : 'not-available',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const connector = args[1] || 'all';
  await hydrateMcpAuth();
  const router = await createMcpRouter();

  if (command === 'status') {
    console.log(JSON.stringify(await router.status({ probe: true }), null, 2));
    return;
  }
  if (command === 'tools') {
    const tools = await router.tools(connector, { probe: true, skipUnavailable: connector === 'all' });
    console.log(JSON.stringify(tools.map(({ connector: c, name, description }) => ({ connector: c, name, description })), null, 2));
    return;
  }
  if (command === 'test') {
    const status = await router.status({ probe: true });
    console.log(JSON.stringify(connector === 'all' ? status : status.filter(item => item.name === connector), null, 2));
    return;
  }
  throw new Error('Usage: node scripts/mcp-auth-bridge.mjs status | tools [connector] | test [connector]');
}

if (process.argv[1]?.endsWith('mcp-auth-bridge.mjs')) {
  main().catch(error => { console.error(redactText(error.message)); process.exitCode = 1; });
}
