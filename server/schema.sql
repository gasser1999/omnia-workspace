-- Omnia Workspace — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor (or: npm run migrate).

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  mime text,
  size_bytes bigint not null default 0,
  storage_path text not null,
  category text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists files_user_created_idx on files (user_id, created_at desc);

create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  size_bytes bigint not null default 0,
  counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Defense in depth: the API talks to Postgres with the service role.
-- Enable RLS so that the public anon key can never read these tables directly.
alter table users enable row level security;
alter table workspaces enable row level security;
alter table files enable row level security;
alter table backups enable row level security;

-- No policies are created on purpose: only the service role (server) can access.
