# DeepSeek Harness for BharatShop

This integration adds DeepSeek Harness as a separate AI engineering/operator runtime for the BharatShop repository. It does **not** replace the storefront runtime, production database, or existing agent queue.

## Why it is isolated

DeepSeek Harness currently requires Node.js `22.19+` (or `24+`), while BharatShop's existing production Docker image is still based on Node 20. Keeping Harness separate prevents an agent-runtime experiment from destabilizing the production application.

DeepSeek Harness is also still a developer-preview project. The launcher pins a known prerelease instead of following a moving `latest` tag automatically. Override the pin only after testing by setting `DSH_VERSION`.

## 1. Check the machine

From the BharatShop repository root:

```bash
node scripts/deepseek-harness.mjs status
```

The command reports:

- current Node.js version
- pinned Harness version
- whether a global `dsh` command is present
- whether Ollama is detected
- the isolated `DSH_HOME` used for BharatShop

If Node is older than 22.19, upgrade Node before installing Harness. Do not change the production Docker image merely to satisfy this local operator tool.

## 2. Install DeepSeek Harness

```bash
node scripts/deepseek-harness.mjs install
```

The launcher installs the pinned `@deepseek-ai/dsh` CLI globally and keeps BharatShop Harness state under:

```text
.runtime/deepseek-harness
```

`.runtime/` is already ignored by Git, so Harness profiles, sessions, and credentials are not committed.

## 3. Start the Harness UI

```bash
node scripts/deepseek-harness.mjs web
```

Default UI:

```text
http://127.0.0.1:3080
```

Use another port when needed:

```bash
node scripts/deepseek-harness.mjs web --port 3081
```

## 4. Use a free/local model through Ollama

In DeepSeek Harness open **Settings -> Models -> Add a custom provider**.

Recommended local-provider shape:

```text
Provider ID: ollama
Display name: Ollama
Base URL: http://127.0.0.1:11434/v1
API protocol: openai-completions
API key: leave blank for a normal local Ollama server
Model ID: use the exact model name shown by `ollama list`
```

The existing tiny BharatShop production model is intended for lightweight inference and should not automatically become the Harness coding brain. Use a tool-capable local model with a practical context window for repository work.

If Harness itself runs in Docker, WSL, a VM, or another machine, remember that `127.0.0.1` refers to that environment, not necessarily the host running Ollama.

## 5. Select the BharatShop workspace

In the Harness UI choose the BharatShop repository root as the workspace. Start with a read-only verification task, for example:

```text
Inspect this repository. Do not edit files. Summarize the current architecture, agent runtime, deployment paths, and test commands. Do not read any .env files or credentials.
```

Only enable edits after that first read-only run behaves correctly.

## 6. Run one guarded headless task

After the model/provider has been configured, the repo launcher can submit a one-shot task:

```bash
node scripts/deepseek-harness.mjs task "Run the safest relevant checks for the current branch and report failures. Do not change production data."
```

The launcher automatically prepends `agents/DEEPSEEK_SYSTEM_AGENT.md`, which contains BharatShop's non-destructive database, credential, Git, and approval rules.

## Safety boundary

The launcher removes ambient database/token/password-style environment variables from the Harness process. However, a coding agent with workspace access can still read files that exist in the checkout. If `.env.local` or other credential files are present, do **not** authorize the agent to inspect them.

DeepSeek Harness is suitable here as the repository/operator agent. BharatShop's existing application agents, storefront APIs, payments, production database, and scheduled automation remain under the current application architecture until a separate tested integration explicitly bridges them.
