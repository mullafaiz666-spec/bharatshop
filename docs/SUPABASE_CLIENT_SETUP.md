# Supabase browser and server clients

Install the exact versions in package.json with `npm ci`. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in an ignored local environment file and in each hosting environment. Do not commit environment files or use a privileged key in a public variable.

The helpers live in `src/utils/supabase`. Server Components can use `await createClient()` or pass `await cookies()` explicitly. Browser components use `createClient()` from the browser helper. The session helper calls `getClaims()` and propagates refreshed cookies and cache headers to the response. Next.js 16 uses `src/proxy.ts`; do not add a second middleware file.

Visit `/supabase` to check access to the existing products table. Session refresh is scoped to that route. Extend the matcher when adding more Supabase-backed pages. Existing BharatShop administrator authentication continues to use its original checks.

The supplied todos example is not used as the storefront: this project has no todos table. The Supabase products table currently has UUID IDs and a different schema from BharatShop's Drizzle tables. The public API clients do not replace the server-side DATABASE_URL or recover original product rows. Catalogue cutover requires a reviewed migration and parity checks.
