-- Stand-ins for the parts of the Supabase platform the migrations depend on,
-- so they can be applied to an in-process Postgres (PGlite) and tested.
--
-- Everything that affects authorization is copied from the linked production
-- project on 2026-09-15 rather than written from memory:
--   - auth.uid(), auth.role(), auth.jwt()   verbatim function bodies
--   - storage.foldername(), protect_delete() verbatim function bodies
--   - role attributes: anon/authenticated are plain roles, service_role has
--     BYPASSRLS, and anon + authenticated hold every table privilege in public,
--     so row level security is the only thing standing between a signed-in
--     user and the data. Tests that pass here pass for that reason too.
--
-- Deliberately NOT modelled: GoTrue, the Storage API server, PostgREST.
-- Tests call functions and run queries as the roles those servers switch to.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ------------------------------------------------------------------- auth

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
 returns uuid
 language sql
 stable
as $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

create or replace function auth.role()
 returns text
 language sql
 stable
as $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

create or replace function auth.jwt()
 returns jsonb
 language sql
 stable
as $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

-- ---------------------------------------------------------------- storage

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  owner_id text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  user_metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

create or replace function storage.foldername(name text)
 returns text[]
 language plpgsql
 immutable
as $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$;

-- Production blocks DELETE on storage.objects unless the Storage API server
-- sets storage.allow_delete_query for its own statement. Kept, because it
-- decides where photo cleanup is allowed to live.
create or replace function storage.protect_delete()
 returns trigger
 language plpgsql
as $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$;

create trigger protect_objects_delete
  before delete on storage.objects
  for each statement execute function storage.protect_delete();
