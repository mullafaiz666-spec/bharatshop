#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createMcpRouter, redactText } from './mcp-router.mjs';

const execFileAsync = promisify(execFile);

async function gitCredentialToken() {
  return new Promise(resolve => {
    let settled = false;
    let stdout = '';
    const child = spawn('git', ['credential', 'fill'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: {
        ...process.env,
        GCM_INTERACTIVE: 'Never',
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    const finish = token => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(token || null);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(null);
    }, 10_000);

    child.stdout?.on('data', chunk => {
      stdout += String(chunk || '');
      if (stdout.length > 64 * 1024) stdout = stdout.slice(0, 64 * 1024);
    });
    child.on('error', () => finish(null));
    child.on('close', code => {
      if (code !== 0) return finish(null);
      const passwordLine = stdout.split(/\r?\n/).find(line => line.startsWith('password='));
      const token = passwordLine ? passwordLine.slice('password='.length).trim() : '';
      finish(token || null);
    });

    child.stdin?.end('protocol=https\nhost=github.com\n\n');
  });
}

async function hydrateGitHubAuth() {
  if (process.env.GITHUB_MCP_TOKEN) return { state: 'existing-env' };

  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const token = String(process.env[key] || '').trim();
    if (token) {
      process.env.GITHUB_MCP_TOKEN = token;
      return { state: `loaded-from-${key.toLowerCase()}` };
    }
  }

  const commands = process.platform === 'win32' ? ['gh.exe', 'gh'] : ['gh'];
  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(command, ['auth', 'token', '--hostname', 'github.com'], {
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      });
      const token = String(stdout || '').trim();
      if (!token) continue;
      process.env.GITHUB_MCP_TOKEN = token;
      return { state: 'loaded-from-gh' };
    } catch {
      // Try the next executable spelling. Never print credential command output.
    }
  }

  // Git for Windows commonly authenticates via Git Credential Manager even when
  // GitHub CLI is not installed. Ask Git's configured credential helper
  // non-interactively and keep the returned password/token only in this process.
  const credentialToken = await gitCredentialToken();
  if (credentialToken) {
    process.env.GITHUB_MCP_TOKEN = credentialToken;
    return { state: 'loaded-from-git-credential-manager' };
  }

  return { state: 'not-available' };
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

  if (command === 'call') {
    const toolName = args[2];
    if (!connector || connector === 'all' || !toolName) {
      throw new Error('Usage: node scripts/mcp-auth-bridge.mjs call <connector> <tool> [jsonArgs]');
    }

    let toolArgs = {};
    if (args[3]) {
      try { toolArgs = JSON.parse(args[3]); }
      catch { throw new Error('call jsonArgs must be valid JSON.'); }
    }

    console.log(JSON.stringify(
      await router.call(connector, toolName, toolArgs),
      null,
      2
    ));
    return;
  }

  throw new Error('Usage: node scripts/mcp-auth-bridge.mjs status | tools [connector] | test [connector] | call <connector> <tool> [jsonArgs]');
}

if (process.argv[1]?.endsWith('mcp-auth-bridge.mjs')) {
  main().catch(error => { console.error(redactText(error.message)); process.exitCode = 1; });
}
