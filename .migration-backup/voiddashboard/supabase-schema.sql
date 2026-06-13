-- Run this once in your Supabase project:
-- Dashboard → SQL Editor → New query → paste this → Run

create table if not exists profiles (
  discord_id  text primary key,
  username    text not null default 'Discord User',
  avatar_url  text,
  role        text not null default 'staff',
  updated_at  timestamptz not null default now()
);

create table if not exists staff_stats (
  discord_id             text primary key,
  username               text not null default 'Discord User',
  avatar_url             text,
  guild_id               text,
  week_start             text,
  tickets_claimed_total  integer not null default 0,
  tickets_claimed_week   integer not null default 0,
  messages_total         integer not null default 0,
  messages_week          integer not null default 0,
  last_claimed_at        timestamptz,
  updated_at             timestamptz not null default now()
);

create table if not exists dashboard_message_events (
  id          text primary key default gen_random_uuid()::text,
  message_id  text unique,
  discord_id  text,
  channel_id  text,
  guild_id    text,
  created_at  timestamptz not null default now()
);

create table if not exists ticket_transcripts (
  ticket_channel_id    text primary key,
  guild_id             text,
  ticket_channel_name  text,
  ticket_type          text,
  opener_id            text,
  opener_username      text,
  claimed_by           text,
  claimed_by_username  text,
  closed_by            text,
  closer_username      text,
  close_reason         text,
  transcript_text      text,
  discord_message_url  text,
  closed_at            timestamptz,
  metadata             jsonb not null default '{}'::jsonb,
  updated_at           timestamptz not null default now()
);

create table if not exists mod_checks (
  id                  text primary key default gen_random_uuid()::text,
  weekly_ticket_goal  integer not null default 0,
  message_goal        integer not null default 0,
  active_from         timestamptz,
  active_to           timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists dashboard_settings (
  id                  text primary key default 'global',
  auth_guild_id       text,
  auth_role_id        text,
  auth_role_ids       text[],
  tracked_role_ids    text[],
  admin_discord_ids   text[],
  weekly_ticket_goal  integer not null default 0,
  message_goal        integer not null default 0,
  updated_at          timestamptz,
  updated_by          text
);

-- Allow the service role key to read/write all rows (no RLS needed for bot sync)
alter table profiles             disable row level security;
alter table staff_stats          disable row level security;
alter table dashboard_message_events disable row level security;
alter table ticket_transcripts   disable row level security;
alter table mod_checks           disable row level security;
alter table dashboard_settings   disable row level security;
