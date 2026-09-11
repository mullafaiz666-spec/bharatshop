# BharatShop Pinokio local workstation

Pinokio is an **optional local workstation**, not the BharatShop production host.

## Why it is useful

Pinokio can turn the existing BharatShop development commands into one-click local actions. This is useful for:

- running the Next.js storefront/admin experience locally;
- testing agent and product workflows without consuming hosted build minutes;
- using the existing local OpenAI-compatible Gemma gateway on a desktop that has Ollama installed;
- keeping experiments and local model compute separate from production checkout and customer traffic.

## What it must not replace

Production remains the hosted architecture:

`GitHub -> Netlify -> Next.js -> PostgreSQL/Supabase -> Supabase Storage -> Gemini -> Razorpay/Cashfree`

Do not route production payments, orders, digital entitlements, webhooks, or the production database through a Pinokio desktop. A laptop/desktop may be offline, asleep, behind NAT, or unavailable.

Pinokio must never become a bypass around BharatShop approval gates. Paid advertising, supplier payments, refunds/payouts, credential changes, and destructive database actions still require the existing approval/policy layer.

## Launcher files

- `pinokio.js` — Pinokio 8 launcher menu.
- `pinokio.json` — launcher metadata.
- `install.js` — installs the locked Node dependencies with `npm ci`.
- `start.js` — starts the BharatShop Next.js development server on a Pinokio-assigned local port.
- `start-local-ai.js` — optional local Gemma gateway wrapper. It uses the existing `local-ai/start.sh` implementation and intentionally fails closed if Ollama is unavailable.

## Local Gemma prerequisite

The optional local AI button expects:

1. `ollama` available in the Pinokio shell environment; and
2. the `gemma3:270m-it-qat` model already pulled locally.

The launcher does **not** silently download a model or change production AI configuration. This avoids unexpected multi-hundred-megabyte downloads and prevents local experiments from altering the hosted Gemini configuration.

When the gateway is running, it exposes the existing OpenAI-compatible endpoints such as `/v1/models` and `/v1/chat/completions` on the Pinokio-assigned local port.

## Secrets

Do not commit `.env`, `.env.local`, Supabase service-role keys, payment secrets, Meta tokens, or Gemini credentials. Pinokio uses the same normal environment-variable rules as the application. The launcher files contain no credentials.

## Database safety

Pinokio install/start actions do not run migrations, `db:push`, seed scripts, truncation, or reset operations. Production PostgreSQL remains the source of truth until the Supabase copy is validated and an explicit cutover is approved.

## Installation

On a supported desktop Pinokio installation, import the public BharatShop repository as a launcher and run **Install BharatShop dependencies**, then **Start BharatShop locally**.

The Pinokio integration is deliberately optional: removing or not using Pinokio has no effect on Netlify deployment, Supabase migration, Gemini, payments, or the production application.
