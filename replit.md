# Bot Dashboard

A Discord staff performance dashboard. Staff log in with Discord via Supabase OAuth, and the dashboard shows weekly ticket claims, message counts, mod-check progress, and closed-ticket transcripts. Admins get a panel to configure weekly goals and access role IDs. The Discord bot pushes stats and transcripts via a bot-sync API.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/bot-dashboard run dev` — run the frontend (port 25712)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/bot-dashboard)
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: Supabase Discord OAuth (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY on frontend; SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY on backend)

## Where things live

- `artifacts/bot-dashboard/src/App.tsx` — main dashboard React component
- `artifacts/bot-dashboard/src/supabaseClient.ts` — Supabase auth helper
- `artifacts/bot-dashboard/src/dashboard.css` — all dashboard styles
- `artifacts/api-server/src/routes/dashboard.ts` — `/api/dashboard`, `/api/admin/mod-checks`, `/api/bot/sync` routes
- `artifacts/api-server/src/lib/dashboardStore.ts` — data access layer (Supabase REST or local JSON fallback)

## Architecture decisions

- The dashboard uses a local JSON file store (`artifacts/api-server/data/dashboard-store.json`) as fallback when Supabase env vars are not set. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to switch to Supabase Postgres.
- Frontend auth is fully custom (no `@supabase/supabase-js`) — hash-based OAuth session parsing + localStorage, to avoid bundle size overhead.
- All dashboard styles live in `dashboard.css` (not Tailwind) to preserve the original v0/Vercel design exactly.
- Bot API (`/api/bot/sync`) is authenticated with `DASHBOARD_BOT_API_KEY` env var.

## Product

- Discord OAuth login via Supabase
- Weekly mod-check progress bars (tickets claimed, ticket messages)
- Stat strip showing totals
- Admin panel: configure weekly goals and Discord role/guild IDs for access control
- Staff leaderboard (auto-refreshes every 10s for admins)
- Ticket transcript library

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Replit secrets for the frontend to enable real Discord OAuth login.
- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the backend to use Supabase data instead of the local JSON file.
- Set `DISCORD_BOT_TOKEN` to enable staff verification against Discord guild roles.
- Set `DASHBOARD_BOT_API_KEY` to secure the bot sync endpoint.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
