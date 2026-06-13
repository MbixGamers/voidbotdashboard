create table if not exists public.profiles (
  discord_id text primary key,
  username text not null,
  avatar_url text,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_stats (
  discord_id text primary key references public.profiles(discord_id) on delete cascade,
  username text not null,
  avatar_url text,
  guild_id text,
  week_start date not null default date_trunc('week', now())::date,
  tickets_claimed_total integer not null default 0,
  tickets_claimed_week integer not null default 0,
  messages_total integer not null default 0,
  messages_week integer not null default 0,
  last_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mod_checks (
  id uuid primary key default gen_random_uuid(),
  weekly_ticket_goal integer not null default 0,
  message_goal integer not null default 0,
  is_active boolean not null default true,
  created_by text,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_transcripts (
  id uuid primary key default gen_random_uuid(),
  ticket_channel_id text not null unique,
  guild_id text,
  ticket_channel_name text,
  ticket_type text,
  opener_id text,
  opener_username text,
  claimed_by text,
  claimed_by_username text,
  closed_by text,
  closer_username text,
  close_reason text,
  transcript_text text,
  discord_message_url text,
  closed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_stats
  add column if not exists guild_id text;

create index if not exists staff_stats_week_idx on public.staff_stats(week_start);
create index if not exists staff_stats_guild_week_idx on public.staff_stats(guild_id, tickets_claimed_week desc, messages_week desc);
create index if not exists transcripts_closed_at_idx on public.ticket_transcripts(closed_at desc);
create index if not exists transcripts_people_idx on public.ticket_transcripts(opener_id, claimed_by, closed_by);

alter table public.profiles enable row level security;
alter table public.staff_stats enable row level security;
alter table public.mod_checks enable row level security;
alter table public.ticket_transcripts enable row level security;

-- The Vercel API uses the service-role key for reads/writes after validating Supabase auth tokens.
-- Keep browser clients blocked from direct table reads unless you intentionally add stricter RLS policies later.

create table if not exists public.dashboard_settings (
  id text primary key default 'global' check (id = 'global'),
  auth_guild_id text not null default '1454879351605690522',
  auth_role_id text not null default '1454916770912534706,1478605157523787916,1478604846708822087,1458995834984206560',
  updated_by text,
  admin_discord_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_settings (id, auth_guild_id, auth_role_id)
values ('global', '1454879351605690522', '1454916770912534706,1478605157523787916,1478604846708822087,1458995834984206560')
on conflict (id) do update
set auth_guild_id = excluded.auth_guild_id,
    auth_role_id = excluded.auth_role_id,
    updated_at = now()
where public.dashboard_settings.auth_guild_id = '1351362266246680626'
  and public.dashboard_settings.auth_role_id = '1444524137526853723';

alter table public.dashboard_settings
  add column if not exists admin_discord_ids text[] not null default '{}';

alter table public.dashboard_settings
  add column if not exists auth_role_ids text[] not null default '{}',
  add column if not exists tracked_role_ids text[] not null default '{}',
  add column if not exists weekly_ticket_goal integer not null default 0,
  add column if not exists message_goal integer not null default 0;

update public.dashboard_settings
set auth_role_ids = string_to_array(auth_role_id, ','),
    tracked_role_ids = string_to_array(auth_role_id, ',')
where coalesce(array_length(auth_role_ids, 1), 0) = 0
   or coalesce(array_length(tracked_role_ids, 1), 0) = 0;

create table if not exists public.dashboard_message_events (
  message_id text primary key,
  discord_id text not null,
  channel_id text,
  guild_id text,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_message_events_staff_idx on public.dashboard_message_events(discord_id, created_at desc);

alter table public.dashboard_settings enable row level security;
alter table public.dashboard_message_events enable row level security;
