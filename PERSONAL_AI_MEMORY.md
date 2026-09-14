# BharatShop Personal AI — Four-Layer Memory

The screenshot pattern is useful, but BharatShop should implement it as a production-safe four-layer memory stack rather than a single undifferentiated transcript.

## Memory layers

| Layer | BharatShop role | Persistence | Examples |
|---|---|---|---|
| Working memory | What the agent is doing now | Session/run scoped | current task, active plan, pending tool result |
| Episodic memory | What happened before | Persistent | completed tasks, outcomes, failures, decisions, lessons |
| Semantic memory | What is generally true | Persistent | architecture rules, verified facts, project knowledge |
| Personal memory | User-specific preferences | Persistent | preferred workflows, style, recurring choices |

This separation follows the established agent-memory pattern: working, episodic, semantic and procedural/personalized layers should not be collapsed into one store. citeturn0search6turn0search9

## Current implementation

`./scripts/personal-ai-memory.mjs` provides the four stores locally under:

```text
~/.bharatshop-ai/memory/
  working.jsonl
  episodic.jsonl
  semantic.jsonl
  personal.jsonl
```

All four stores reject obvious credentials/secrets before persistence.

### Commands

```powershell
npm.cmd run memory:status
npm.cmd run memory:clear-working
npm.cmd run memory:remember -- semantic "Render is the production authority"
npm.cmd run memory:recall -- semantic "Render"
```

## Skills are separate

The screenshot's `Observe / Research / Plan / Code / Review` should be treated as **procedural capability/skills**, not mixed into semantic facts. BharatShop already has a specialist Agency workforce plus DeepSeek Harness/Codex/Claude Code delegation, so these capabilities belong to the agent skill/tool layer.

## Tools

Tool integrations remain separate from memory. BharatShop currently has local Ollama, Agency Agents, Browser Use, DeepSeek Harness, company-agent execution and guarded creative/provider connectors. Memory records what happened; tools perform actions.

## Safety

- PostgreSQL remains the source of truth for products, customers, orders, payments and operational business data.
- Memory must never become an alternate production database.
- Secrets, tokens, passwords and database URLs are not persisted by the local memory logger.
- Production-impacting actions remain behind the existing approval boundary.
- No production database reset or destructive migration is part of this memory addition.
