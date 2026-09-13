# DeepSeek Harness for BharatShop

BharatShop uses DeepSeek Harness as a separate AI engineering/operator runtime. It does **not** replace the storefront runtime, production database, payment stack, or existing company-agent queue.

The BharatShop Harness setup gives the supervisor two official product subagents:

- `subagent_codex` — one-shot Codex delegation
- `subagent_claude_code` — one-shot Claude Code delegation

The parent Harness agent remains responsible for task routing, final verification, and BharatShop safety rules.

## Architecture

```text
BharatShop System Agent (DeepSeek Harness)
├── local/OpenAI-compatible parent model
├── subagent_codex
├── subagent_claude_code
├── normal Harness tools / spawn / fork
└── BharatShop repository + existing application agents
```

Codex and Claude Code are genuine DeepSeek Harness product-provider integrations. The bundles carry their pinned compatible product payloads and do not depend on falling back to arbitrary `codex` or `claude` executables found on the host PATH. Their account/login state and native product settings remain authoritative.

## Why Harness stays separate from production

DeepSeek Harness requires Node.js `22.19+` (or `24+`), while BharatShop's existing production Docker image is still based on Node 20. The operator runtime therefore stays separate from the production application instead of forcing a risky production runtime upgrade.

Harness is still a developer-preview project. The BharatShop launcher pins `@deepseek-ai/dsh@0.1.5-rc.2` and installs matching product-provider versions instead of silently following a moving npm tag. Override `DSH_VERSION` only after testing a newer release.

## Harness home and credential boundary

By default BharatShop uses:

```text
~/.dsh-bharatshop
```

for Harness profiles, settings, sessions, and plugin state. Keeping this outside the repository reduces the chance that a coding agent accidentally reads Harness account/session material while inspecting the workspace.

You can override the location with `DSH_HOME`, but do not point it at the BharatShop repository or commit it to Git.

## 1. Check prerequisites

From the BharatShop repository root:

```bash
npm run harness:status
```

The status command reports:

- current Node.js compatibility
- pinned Harness version
- global `dsh` availability
- Ollama availability
- Codex + Claude Code bundle presence for `web` and `headless`
- BharatShop System Agent preset presence
- headless delegation overlay presence

If Node is older than 22.19, upgrade the **operator machine's** Node installation. Do not change the BharatShop production Docker image just to run Harness.

## 2. Install Harness

```bash
npm run harness:install
```

The launcher installs the pinned Harness CLI. The launcher can also use the same pinned package through `npx`, so all repo commands stay version-controlled.

## 3. Install both product subagents

```bash
npm run harness:subagents
```

This performs four provider installations using the exact pinned Harness version:

```text
web      -> Codex + Claude Code
headless -> Codex + Claude Code
```

It also copies the repo-maintained `bharatshop-system` preset into:

```text
~/.dsh-bharatshop/.agent-presets/bharatshop-system
```

Existing local preset copies are not overwritten automatically. To intentionally refresh the local copy after reviewing a repo update, run:

```bash
node scripts/deepseek-harness.mjs subagents --refresh-preset
```

### Authentication

The bootstrap does **not** manufacture, copy, or expose credentials. Codex and Claude Code keep their native account/login state. Authenticate those products through their supported native login/account flow on the operator machine.

Do not paste product tokens into BharatShop source files, `.env.local`, `AGENTS.md`, `CLAUDE.md`, or Harness prompts.

## 4. Configure the parent model

The parent DeepSeek Harness agent can use a local or OpenAI-compatible model. For a free/local setup, start Ollama and configure a custom provider in Harness.

Typical local provider values:

```text
Provider ID: ollama
Display name: Ollama
Base URL: http://127.0.0.1:11434/v1
Protocol: OpenAI-compatible
API key: blank for a normal local Ollama server
Model ID: exact model shown by `ollama list`
```

Do not automatically use BharatShop production's tiny `gemma3:270m-it-qat` model as the Harness coding supervisor. That model is intentionally small for the free production gateway and is not sized for a large repository/tool context.

Codex and Claude Code subagents use their own native model/account settings; choosing Ollama for the parent does not replace their product runtimes.

## 5. Start the Web operator UI

```bash
npm run harness:web
```

Default bind address:

```text
http://127.0.0.1:3080
```

Use another port when needed:

```bash
node scripts/deepseek-harness.mjs web --port 3081
```

For a new session choose:

```text
BharatShop System Agent
```

That repo-maintained preset exposes both product tools:

```text
subagent_codex
subagent_claude_code
```

The two tools are separate and can be delegated independent tasks. Product subagents are one-shot: every call gets one self-contained task and returns its final result or a safe failure diagnostic.

## 6. Run a guarded headless task

DeepSeek Harness headless mode does not mount Web agent presets. The BharatShop launcher therefore applies a dedicated invocation-only overlay that exposes the same two product delegation tools to the headless agent.

Example:

```bash
npm run harness:task -- "Inspect the current branch. Delegate implementation-risk review to Claude Code and test/debug review to Codex, then verify their findings yourself. Do not change production data."
```

Equivalent direct command:

```bash
node scripts/deepseek-harness.mjs task "Inspect the current branch and use both product subagents where useful."
```

Before the task, the launcher injects `agents/DEEPSEEK_SYSTEM_AGENT.md` plus explicit delegation guidance. The repository also contains `AGENTS.md` and `CLAUDE.md` so delegated coding products receive the BharatShop safety boundary from their normal repository-instruction surfaces.

## Delegation pattern

Use subagents for bounded work rather than handing the entire company runtime to one child process. A useful split is:

```text
Harness supervisor
├── Claude Code: architecture review, refactor design, difficult code review
├── Codex: implementation, targeted fixes, tests, debugging
└── Supervisor: reconcile results, run verification, enforce approval boundaries
```

The supervisor may run independent subagent jobs in parallel when useful, but it must still inspect the returned result and verify the repository state before claiming success.

## Permission policy

Keep the product providers on their upstream safe non-interactive defaults unless a reviewed task requires more capability:

- Codex default: `permissionMode: never`
- Claude Code default: `permissionMode: dontAsk`

Do not use dangerous approval/sandbox bypass modes for the BharatShop system-agent setup.

## Repository safety boundary

All three coding layers must follow these files:

```text
AGENTS.md
CLAUDE.md
agents/DEEPSEEK_SYSTEM_AGENT.md
```

Core rules include:

- no destructive production database operations
- no reading or exposing secrets
- no force-push/rewrite of shared Git history
- no bypassing auth, payments, approval gates, or safety checks to make tests pass
- no unverified "operational" claims
- no production-data mutation without explicit authorization
- no irreversible external publishing/billing/cutover action outside existing approval gates

A coding agent with repository access can technically encounter files such as `.env.local` if they exist in the checkout. The policy is therefore both technical and behavioral: keep Harness state outside the repo, keep secrets out of prompts/source control, and never authorize credential-file inspection.

## Recommended command sequence

```bash
npm run harness:status
npm run harness:install
npm run harness:subagents
npm run harness:status
npm run harness:web
```

After native Codex and Claude Code authentication is complete, start a `BharatShop System Agent` session and test each subagent first with a read-only repository task before granting it implementation work.
