# BharatShop Free-Stack Takeover

## Current architecture lock

- Application hosting: Netlify from the GitHub `main` branch.
- Database: existing production PostgreSQL remains authoritative until a Supabase copy is verified read-only and an explicit cutover is approved.
- Target database/storage: Supabase PostgreSQL + Supabase Storage.
- Hosted AI: Gemini through the BharatShop provider abstraction.
- Optional local AI: Pinokio + Ollama/Gemma for development and owned-hardware fallback only; customer traffic, payments and production admin must not depend on a desktop process.
- Image/evidence discovery: SearXNG remains an optional evidence-search dependency while a non-Render replacement is evaluated. Missing/unreachable search must be reported as unavailable, never faked as ready.
- Payments: Razorpay/Cashfree keep their existing human/business approval and signature-verification gates.
- Paid OpenAI/Anthropic APIs are not required.

## Migration rules

1. GitHub stays the permanent code source of truth.
2. Do not reset, truncate, destructively reseed or replace production PostgreSQL.
3. Do not switch database authority to Supabase until `npm run db:verify-supabase` passes against the source and target copies and the cutover is explicitly approved.
4. Keep secrets server-only. Never expose service-role, payment, admin-session, automation, Meta or Gemini secrets through `NEXT_PUBLIC_` variables.
5. A successful Netlify build is not a production-readiness signal by itself. Admin sessions, database access, AI, search/evidence, payment diagnostics and automation must be verified independently.
6. Human approval remains mandatory for paid advertising/spend, supplier purchases/payments, refunds/payouts, credential changes and destructive database actions.

## Current cutover sequence

1. Deploy the verified GitHub revision to Netlify.
2. Configure the safe public/runtime environment contract.
3. Configure the production database connection and `ADMIN_SESSION_SECRET` under human approval, then verify administrator login.
4. Configure and probe Gemini using a server-side API key.
5. Configure automation/search/payment integrations and run their read-only diagnostics.
6. Prepare and verify the Supabase copy without changing source-of-truth data.
7. Run production acceptance against the exact Netlify commit.
8. Only after all gates pass, approve the final traffic/database cutover and retire Render dependencies.

No destructive production database mutation is part of this plan.
