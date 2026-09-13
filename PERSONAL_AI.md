# BharatShop Personal AI

This is the unified local operator for the user's Windows machine. The core brain and specialist workforce run locally through Ollama; no OpenAI or Anthropic API key is required for the local path.

## One-time setup

```powershell
npm.cmd run ai:setup
```

The setup performs the following on the local machine:

- prepares Ollama and the configured local model (`qwen3.5:4b` by default)
- syncs the public Agency Agents catalog and makes every discovered specialist available on demand
- creates an isolated Python environment for Browser Use and installs local Chromium
- configures Ollama's official DeepSeek Harness launch integration for local coding/app-building tasks
- creates private local Personal AI memory under `~/.bharatshop-ai`
- installs the PixVerse CLI connector, but does not authenticate, subscribe, or authorize credit spend

Then start the unified chat:

```powershell
npm.cmd run ai:start
```

Check the real capability matrix at any time:

```powershell
npm.cmd run ai:status
```

## Chat commands

Inside `ai:start`:

- `/chat <task>` — normal local Q&A and writing
- `/agency <task>` — select several relevant Agency Agents and synthesize their reports
- `/build <task>` — run the local Ollama → DeepSeek Harness coding worker against this repository
- `/browser <task>` — run Browser Use with the local Ollama model and local Chromium
- `/pixverse <task>` — route a creative task through the guarded PixVerse connector
- `/company` — run one existing BharatShop company-agent cycle
- `/status` — show actual runtime readiness
- `/help` — show commands
- `/exit` — exit

Natural-language prompts are routed automatically. Routes that can modify files, operate a browser, run the company cycle, or call PixVerse require approval in interactive mode.

## One-shot tasks

Planning/read-only local tasks can be sent directly:

```powershell
npm.cmd run ai:task -- "Give me a launch strategy for a new streetwear line"
```

For an action route, add `--execute` explicitly:

```powershell
npm.cmd run ai:task -- "Build a small Next.js feature and test it" --route build --execute
npm.cmd run ai:task -- "Open example.com and inspect the page" --route browser --execute
```

## What green means

The status command reports green only when a local runtime/connector can actually be detected on that machine. It does not fake provider readiness.

The free/local core can be green without paid AI APIs:

- Ollama local AI
- local model
- Agency Agents catalog
- local memory
- DeepSeek Harness app builder through Ollama
- Browser Use through Ollama
- BharatShop company-agent wiring

PixVerse is different. The official PixVerse CLI uses the provider's account/subscription/credit system. The connector can be installed and wired, but generation is not represented as free. Existing `PIXVERSE_ENABLED` and `PIXVERSE_ALLOW_CREDIT_SPEND` gates remain in place and the Personal AI setup never enables them automatically.

## Safety boundaries

- Production database changes remain protected by the existing BharatShop rules.
- Browser automation stops before purchases, payments, publishing, message sending, account/security changes, legal acceptance, deletion, or another irreversible action.
- Local build mode tells DeepSeek Harness not to call Claude Code, Codex, paid APIs, or inspect credentials.
- Personal AI memory is local. Prompts that look like passwords, tokens, secrets, or API keys are not persisted by the local memory logger.
