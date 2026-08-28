# Deployment trigger

The application build runs `drizzle-kit push --force` before `next build` so the production PostgreSQL schema is synchronized during deployment.

This file exists to trigger a fresh Render deployment after the end-to-end order-loop fixes were merged to `main`.
