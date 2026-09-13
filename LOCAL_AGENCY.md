# BharatShop Free Local Agency

This integration makes the public `msitarzewski/agency-agents` catalog usable on a Windows machine without paid LLM APIs.

## Architecture

```text
agency-agents catalog
        |
        v
scripts/local-agency.mjs
        |
        v
Ollama on 127.0.0.1:11434
        |
        v
qwen3.5:4b (default local model)
```

The catalog is cloned outside the BharatShop repository to:

```text
~/.bharatshop-agency/agency-agents
```

The runtime discovers the upstream division list dynamically, so new upstream agents appear after `agency:sync` without copying all prompt files into BharatShop.

## Why this is free

- No OpenAI API key is required.
- No Anthropic API key is required.
- No cloud model is required.
- The default inference server is local Ollama.
- The default model is `qwen3.5:4b`.
- Agent definitions come from the public Agency Agents repository.

Your electricity, storage, bandwidth, and computer hardware are still your own costs.

## Windows setup

From the BharatShop checkout:

```powershell
npm.cmd run agency:setup
```

The setup command:

1. clones or updates the Agency Agents catalog,
2. installs Ollama with WinGet when Ollama is missing on Windows,
3. starts the local Ollama service when necessary,
4. downloads the configured local model.

If Windows installs Ollama but the current terminal cannot see it yet, reopen PowerShell and rerun the command.

## Start the local agency

```powershell
npm.cmd run agency:start
```

This opens an interactive agent search. Search for terms such as `frontend`, `sales`, `security`, `marketing`, or `product`, choose an agent, and chat locally.

## Other commands

```powershell
npm.cmd run agency:status
npm.cmd run agency:sync
npm.cmd run agency:list
npm.cmd run agency:search -- "sales"
npm.cmd run agency:chat -- frontend-developer
npm.cmd run agency:run -- frontend-developer "Review my landing-page plan"
npm.cmd run agency:team -- frontend-developer,security-architect "Review this product architecture"
```

`agency:team` runs several specialists locally and asks a local synthesis lead to merge their reports.

## Change the local model

PowerShell example:

```powershell
$env:AGENCY_MODEL="qwen3.5:9b"
npm.cmd run agency:setup
npm.cmd run agency:start
```

Use a model that fits your RAM/VRAM. The default `qwen3.5:4b` is intentionally smaller so more Windows machines can run it.

## Safety boundary

The base local agency runtime is conversational. It does not automatically get database credentials, payment credentials, production access, or unrestricted shell/file tools. Agent prompts are instructed not to claim actions they did not perform.

This is intentional: the local Agency catalog is a specialist workforce layer, while production-impacting BharatShop operations remain behind the repository's existing approval and safety boundaries.
