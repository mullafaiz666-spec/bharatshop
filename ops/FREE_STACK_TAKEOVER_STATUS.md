# BharatShop free-stack takeover status

Current state:
- GitHub `main` is connected to Netlify and the application build deploys successfully.
- Netlify production target is `bharatshop-35fd.netlify.app`.
- Hosted AI provider is configured for Gemini 3.7 Flash, but production readiness still requires a server-side Gemini API key and live probe.
- Supabase project URL/public client configuration can be present before database cutover; it does not make Supabase the production source of truth.
- Existing production PostgreSQL remains authoritative and has not been reset, reseeded or destructively modified.
- Pinokio/Ollama/Gemma is optional local development/fallback infrastructure, not production hosting.

Blocking runtime requirements before Netlify can be treated as production-ready:
1. Configure either `DATABASE_URL` (current production source) or the explicitly approved `SUPABASE_DB_URL` after copy verification.
2. Configure `ADMIN_SESSION_SECRET` with at least 32 characters and verify an administrator can create a signed session and reach `/dashboard`.
3. Configure and live-probe Gemini.
4. Configure the automation token and evidence/search provider used by production agents.
5. Verify Razorpay/Cashfree configuration without charging a customer.
6. Run exact-revision production acceptance against Netlify.
7. Verify the Supabase data copy read-only before any database authority cutover.

No missing credential or unavailable provider is to be reported as READY. No destructive database action is authorized by this status update.
