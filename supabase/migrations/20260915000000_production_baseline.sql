-- Production baseline, 2026-09-15.
--
-- This project's schema was built by hand in the SQL editor and then evolved
-- through eight migrations that were also run by hand (they now live in
-- supabase/history/). Those files cannot rebuild it: 0000 was written after
-- the fact and leaves out columns 0001 depends on, and production has
-- constraints and policies no file mentions.
--
-- This file is the schema production actually has, generated from its system
-- catalogs rather than written from memory. It is marked as already applied
-- on the linked project, so it never runs there; it exists so a fresh
-- project, a local database and the test suite all start from the real thing.
-- supabase/tests/baseline.test.ts proves it reproduces production exactly.
--
-- It deliberately reproduces production's problems too, including the two
-- FOR ALL policies that let a member write anywhere in their couple. The
-- migrations after it fix them, so the fix is tested against the real state.

-- ================================================================ tables

create table public.profiles (
  id uuid not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now(),
  avatar_character text default 'mae'::text not null,
  timezone text default 'UTC'::text not null
);

create table public.couples (
  id uuid default gen_random_uuid() not null,
  user1_id uuid,
  user2_id uuid,
  created_at timestamptz default now()
);

create table public.couple_invites (
  code text not null,
  created_by uuid,
  expires_at timestamptz default (now() + '1 day'::interval),
  used boolean default false
);

create table public.tasks (
  id uuid default gen_random_uuid() not null,
  couple_id uuid,
  assigned_to uuid,
  title text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  scheduled_weekdays smallint[] default '{}'::smallint[] not null,
  archived_at timestamptz
);

create table public.task_completions (
  id uuid default gen_random_uuid() not null,
  task_id uuid,
  submitted_by uuid,
  photo_url text not null,
  status text default 'submitted'::text,
  reviewed_by uuid,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  scheduled_date date default CURRENT_DATE not null
);

create table public.love_notes (
  id uuid default gen_random_uuid() not null,
  couple_id uuid not null,
  sender_id uuid not null,
  text text not null,
  created_at timestamptz default now() not null,
  dismissed_at timestamptz
);

create table public.day_schedules (
  user_id uuid not null,
  date_key date not null,
  task_ids uuid[] default '{}'::uuid[] not null,
  updated_at timestamptz default now() not null
);

-- =========================================================== constraints

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.couples add constraint couples_pkey PRIMARY KEY (id);
alter table public.couple_invites add constraint couple_invites_pkey PRIMARY KEY (code);
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.task_completions add constraint task_completions_pkey PRIMARY KEY (id);
alter table public.love_notes add constraint love_notes_pkey PRIMARY KEY (id);
alter table public.day_schedules add constraint day_schedules_pkey PRIMARY KEY (user_id, date_key);
alter table public.couples add constraint couples_user1_id_user2_id_key UNIQUE (user1_id, user2_id);
alter table public.profiles add constraint profiles_avatar_character_check CHECK ((avatar_character = ANY (ARRAY['mae'::text, 'baris'::text])));
alter table public.task_completions add constraint task_completions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text])));
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.couples add constraint couples_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.couples add constraint couples_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.couple_invites add constraint couple_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.tasks add constraint tasks_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;
alter table public.task_completions add constraint task_completions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.task_completions add constraint task_completions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.task_completions add constraint task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table public.love_notes add constraint love_notes_couple_id_fkey FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE;
alter table public.love_notes add constraint love_notes_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.day_schedules add constraint day_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ================================================================== rls

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_invites enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.love_notes enable row level security;
alter table public.day_schedules enable row level security;

-- ============================================================= functions

CREATE OR REPLACE FUNCTION public.my_couple_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from couples
  where user1_id = auth.uid() or user2_id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'New User'));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invite()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i int;
begin
  if my_couple_id() is not null then
    raise exception 'already paired';
  end if;

  for i in 1..6 loop
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  end loop;

  -- "new code" invalidates any previous codes from this user
  update couple_invites set used = true where created_by = auth.uid() and not used;

  insert into couple_invites (code, created_by, expires_at, used)
  values (v_code, auth.uid(), now() + interval '1 year', false);

  return v_code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invite couple_invites%rowtype;
  v_couple_id uuid;
begin
  if my_couple_id() is not null then
    raise exception 'already paired';
  end if;

  select * into v_invite from couple_invites
    where upper(code) = upper(trim(p_code)) and not used
    order by expires_at desc limit 1
    for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;
  if v_invite.created_by = auth.uid() then
    raise exception 'cannot redeem your own invite';
  end if;
  if exists (
    select 1 from couples
    where user1_id = v_invite.created_by or user2_id = v_invite.created_by
  ) then
    raise exception 'inviter is already paired';
  end if;

  insert into couples (user1_id, user2_id)
  values (v_invite.created_by, auth.uid())
  returning id into v_couple_id;

  update couple_invites set used = true where code = v_invite.code;

  return v_couple_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_today_schedule()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tz text;
  v_today date;
  v_dow int;
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select coalesce(timezone, 'UTC') into v_tz from profiles where id = auth.uid();
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  -- freeze any unrecorded past days (up to 60 back) from the current
  -- schedule — the best guess available at first opportunity. Existing
  -- records are never touched, so frozen days stay frozen.
  insert into day_schedules (user_id, date_key, task_ids)
  select
    auth.uid(),
    d.day::date,
    coalesce((
      select array_agg(t.id)
      from tasks t
      where t.assigned_to = auth.uid()
        and (t.created_at at time zone v_tz)::date <= d.day::date
        and (t.archived_at is null
             or (t.archived_at at time zone v_tz)::date > d.day::date)
        and extract(dow from d.day::date) = any (t.scheduled_weekdays)
    ), '{}')
  from generate_series(
    (v_today - 60)::timestamp,
    (v_today - 1)::timestamp,
    interval '1 day'
  ) as d(day)
  where not exists (
    select 1 from day_schedules ds
    where ds.user_id = auth.uid() and ds.date_key = d.day::date
  )
  on conflict (user_id, date_key) do nothing;

  -- today is still live, so it IS refreshed on every call
  v_dow := extract(dow from v_today); -- 0 = Sunday .. 6 = Saturday

  select coalesce(array_agg(id), '{}') into v_ids
  from tasks
  where assigned_to = auth.uid()
    and archived_at is null
    and v_dow = any (scheduled_weekdays);

  insert into day_schedules (user_id, date_key, task_ids, updated_at)
  values (auth.uid(), v_today, v_ids, now())
  on conflict (user_id, date_key)
  do update set task_ids = excluded.task_ids, updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_completion(p_task_id uuid, p_photo_path text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_task tasks%rowtype;
  v_existing task_completions%rowtype;
  v_completion_id uuid;
  v_tz text;
  v_date date;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'task not found';
  end if;
  if v_task.archived_at is not null then
    raise exception 'goal is archived';
  end if;
  if v_task.assigned_to <> auth.uid() then
    raise exception 'not your goal';
  end if;
  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  select coalesce(timezone, 'UTC') into v_tz from profiles where id = auth.uid();
  begin
    v_date := (now() at time zone v_tz)::date;
  exception when others then
    v_date := (now() at time zone 'UTC')::date;
  end;

  perform record_today_schedule();

  select * into v_existing from task_completions
    where task_id = p_task_id and scheduled_date = v_date
    for update;

  if found then
    if v_existing.status = 'approved' then
      raise exception 'already confirmed for this date';
    end if;
    update task_completions set photo_url = p_photo_path, submitted_at = now()
      where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into task_completions (task_id, submitted_by, photo_url, status, scheduled_date, submitted_at)
  values (p_task_id, auth.uid(), p_photo_path, 'submitted', v_date, now())
  returning id into v_completion_id;

  return v_completion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_completion(p_completion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_completion task_completions%rowtype;
  v_task tasks%rowtype;
begin
  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion not found';
  end if;
  if v_completion.status <> 'submitted' then
    raise exception 'completion is not pending';
  end if;
  if v_completion.submitted_by = auth.uid() then
    raise exception 'cannot confirm your own submission';
  end if;

  select * into v_task from tasks where id = v_completion.task_id;
  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  update task_completions set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_completion_id;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================== storage

insert into storage.buckets (id, name, public)
values ('completion-photos', 'completion-photos', false)
on conflict (id) do nothing;

-- ============================================================= policies

create policy "select own invites" on public.couple_invites
  as permissive for select to public
  using ((created_by = auth.uid()));

create policy "select own couple" on public.couples
  as permissive for select to public
  using (((user1_id = auth.uid()) OR (user2_id = auth.uid())));

create policy "select couple day schedules" on public.day_schedules
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM couples
  WHERE (((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid())) AND ((couples.user1_id = day_schedules.user_id) OR (couples.user2_id = day_schedules.user_id))))));

create policy "dismiss couple notes" on public.love_notes
  as permissive for update to public
  using ((couple_id = my_couple_id()));

create policy "select couple notes" on public.love_notes
  as permissive for select to public
  using ((couple_id = my_couple_id()));

create policy "send note" on public.love_notes
  as permissive for insert to public
  with check (((couple_id = my_couple_id()) AND (sender_id = auth.uid())));

create policy "insert own profile" on public.profiles
  as permissive for insert to public
  with check ((id = auth.uid()));

create policy "select own or partner profile" on public.profiles
  as permissive for select to public
  using (((id = auth.uid()) OR (id IN ( SELECT
        CASE
            WHEN (couples.user1_id = auth.uid()) THEN couples.user2_id
            ELSE couples.user1_id
        END AS user1_id
   FROM couples
  WHERE ((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid()))))));

create policy "update own profile" on public.profiles
  as permissive for update to public
  using ((id = auth.uid()));

create policy "view own or partner profile" on public.profiles
  as permissive for select to public
  using (((id = auth.uid()) OR (id IN ( SELECT
        CASE
            WHEN (couples.user1_id = auth.uid()) THEN couples.user2_id
            ELSE couples.user1_id
        END AS user1_id
   FROM couples
  WHERE ((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid()))))));

create policy "couple members access completions" on public.task_completions
  as permissive for all to public
  using ((task_id IN ( SELECT t.id
   FROM (tasks t
     JOIN couples c ON ((c.id = t.couple_id)))
  WHERE ((c.user1_id = auth.uid()) OR (c.user2_id = auth.uid())))));

create policy "select own couple completions" on public.task_completions
  as permissive for select to public
  using ((task_id IN ( SELECT tasks.id
   FROM tasks
  WHERE (tasks.couple_id = my_couple_id()))));

create policy "couple members access tasks" on public.tasks
  as permissive for all to public
  using ((couple_id IN ( SELECT couples.id
   FROM couples
  WHERE ((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid())))));

create policy "insert own goals" on public.tasks
  as permissive for insert to public
  with check (((couple_id = my_couple_id()) AND (assigned_to = auth.uid())));

create policy "select own couple tasks" on public.tasks
  as permissive for select to public
  using ((couple_id = my_couple_id()));

create policy "update own goals" on public.tasks
  as permissive for update to public
  using (((couple_id = my_couple_id()) AND (assigned_to = auth.uid())));

create policy "couple can read own completion photos" on storage.objects
  as permissive for select to public
  using (((bucket_id = 'completion-photos'::text) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE (((couples.id)::text = (storage.foldername(objects.name))[1]) AND ((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid())))))));

create policy "couple can upload own completion photos" on storage.objects
  as permissive for insert to public
  with check (((bucket_id = 'completion-photos'::text) AND (EXISTS ( SELECT 1
   FROM couples
  WHERE (((couples.id)::text = (storage.foldername(objects.name))[1]) AND ((couples.user1_id = auth.uid()) OR (couples.user2_id = auth.uid())))))));
