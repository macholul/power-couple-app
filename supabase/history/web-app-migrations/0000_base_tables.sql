-- Base tables for a FRESH Supabase project. Run this first, then 0001..0005
-- in order, all in the SQL Editor (Dashboard > SQL Editor).
--
-- If your project already has these tables (they were created by hand in the
-- original deployment), this file is a no-op: everything is `if not exists`.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references profiles (id) on delete cascade,
  user2_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists couple_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples (id) on delete cascade,
  assigned_to uuid not null references profiles (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  submitted_by uuid not null references profiles (id) on delete cascade,
  photo_url text not null,
  status text not null default 'submitted',
  reviewed_by uuid references profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
