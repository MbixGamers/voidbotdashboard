# Void Dashboard

This folder is the Vercel-hosted dashboard only. The Discord bot can stay on Katabump and push data into this app through `/api/bot/sync`.

## What is included

- React/Vite dashboard with Discord login through Supabase.
- Authenticated `/api/dashboard` route for staff/admin dashboard data.
- Admin-only `/api/admin/mod-checks` route to set weekly ticket/message goals.
- Bot-only `/api/bot/sync` route for ticket claim stats, message stats, and closed ticket transcripts.
- Supabase schema in `supabase/schema.sql`.

## Important security note

Do **not** put your Discord OAuth client secret in this repo, Vercel frontend env vars, or client-side code. Add the Discord OAuth client ID and secret inside the Supabase dashboard only.

The secret shared in chat should be rotated before production because it has been exposed in plaintext.

## Supabase setup

1. Open your Supabase project.
2. Go to **SQL Editor** and run `supabase/schema.sql`.
3. Go to **Authentication → Providers → Discord**.
4. Enable Discord and enter your Discord OAuth client ID and Discord OAuth client secret.
5. Keep the Supabase callback URL set to:

   ```text
   https://lawgvolthpwsnwhagess.supabase.co/auth/v1/callback
   ```

6. Go to **Authentication → URL Configuration** and add your Vercel domain to allowed redirect URLs after deployment, for example:

   ```text
   https://your-dashboard.vercel.app/**
   ```

## Vercel setup

Create a Vercel project using this folder as the project root:

```text
voiddashboard
```

Use these build settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Add these Vercel environment variables:

```text
VITE_SUPABASE_URL=https://lawgvolthpwsnwhagess.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_URL=https://lawgvolthpwsnwhagess.supabase.co
SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
DASHBOARD_BOT_API_KEY=<generate a long random secret>
DASHBOARD_ADMIN_DISCORD_IDS=<comma-separated Discord user IDs for admins>
```

`VITE_*` values are public browser values. `SUPABASE_SERVICE_ROLE_KEY` and `DASHBOARD_BOT_API_KEY` must remain server-only Vercel variables.

## Katabump bot setup

Add these environment variables to the bot host:

```text
DASHBOARD_BASE_URL=https://your-dashboard.vercel.app
DASHBOARD_BOT_API_KEY=<same long random secret used on Vercel>
```

When staff claim tickets, send messages, or close tickets, the bot now sends events to the dashboard API. Closed tickets are stored as transcripts and include the Discord ticket-log message URL when Discord returns it.

## Local development

```bash
cd voiddashboard
npm install
cp .env.example .env.local
npm run dev
```

For local bot sync testing, point the bot to your local dashboard URL or use a tunnel such as Vercel dev/ngrok and set `DASHBOARD_BASE_URL` accordingly.
