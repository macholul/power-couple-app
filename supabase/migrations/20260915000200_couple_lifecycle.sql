-- Couples can end.
--
-- Until now a couples row was permanent: generate_invite() and
-- redeem_invite() both refuse anyone who is paired, so a breakup or a pairing
-- with the wrong person left both accounts stuck for good.
--
-- Ending is soft. couples.ended_at is set and nothing is deleted, because a
-- hard delete cascades through tasks and completions and would destroy both
-- partners' history on one person's tap. Instead every policy now asks for
-- the ACTIVE couple, so an ended couple's data is simply unreachable. If the
-- same two people pair again, their old row is reactivated and the history
-- comes back; production also has UNIQUE (user1_id, user2_id), so reuse is
-- required anyway. Data belonging to an ended couple is erased when either
-- partner deletes their account.
--
-- Along the way: policies target `authenticated` instead of `public` (anon
-- never evaluates them), helpers move to a schema the API does not expose,
-- and auth.uid() is wrapped in a subselect so Postgres evaluates it once per
-- statement instead of once per row (Supabase advisor 0003).

alter table public.couples add column ended_at timestamptz;

-- ------------------------------------------------------------------ helpers

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.couples
  where ended_at is null
    and (select auth.uid()) in (user1_id, user2_id)
  limit 1;
$$;

create or replace function private.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when user1_id = (select auth.uid()) then user2_id else user1_id end
  from public.couples
  where ended_at is null
    and (select auth.uid()) in (user1_id, user2_id)
  limit 1;
$$;

-- A person is in at most one active couple. redeem_invite() serializes the
-- race with advisory locks; this makes the state impossible regardless of
-- which code path writes the row.
create or replace function private.enforce_one_active_couple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ended_at is null and exists (
    select 1 from public.couples c
    where c.id <> new.id
      and c.ended_at is null
      and (c.user1_id in (new.user1_id, new.user2_id) or c.user2_id in (new.user1_id, new.user2_id))
  ) then
    raise exception 'already paired';
  end if;
  return new;
end;
$$;

create trigger couples_one_active_per_person
  before insert or update of user1_id, user2_id, ended_at on public.couples
  for each row execute function private.enforce_one_active_couple();

-- Only the two lookups are for callers; the trigger function is not.
revoke execute on all functions in schema private from public;
grant execute on function private.current_couple_id() to authenticated, service_role;
grant execute on function private.current_partner_id() to authenticated, service_role;

-- ----------------------------------------------------------------- policies

drop policy if exists "select own or partner profile" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "select own couple" on public.couples;
drop policy if exists "select own invites" on public.couple_invites;
drop policy if exists "select own couple tasks" on public.tasks;
drop policy if exists "insert own goals" on public.tasks;
drop policy if exists "update own goals" on public.tasks;
drop policy if exists "select own couple completions" on public.task_completions;
drop policy if exists "select couple notes" on public.love_notes;
drop policy if exists "send note" on public.love_notes;
drop policy if exists "dismiss couple notes" on public.love_notes;
drop policy if exists "select couple day schedules" on public.day_schedules;
drop policy if exists "couple can read own completion photos" on storage.objects;
drop policy if exists "couple can upload own completion photos" on storage.objects;

create policy "read own and partner profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id = (select private.current_partner_id()));

create policy "create own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "read own active couple" on public.couples
  for select to authenticated
  using (ended_at is null and (select auth.uid()) in (user1_id, user2_id));

create policy "read own invites" on public.couple_invites
  for select to authenticated
  using (created_by = (select auth.uid()));

create policy "read couple goals" on public.tasks
  for select to authenticated
  using (couple_id = (select private.current_couple_id()));

create policy "create own goals" on public.tasks
  for insert to authenticated
  with check (couple_id = (select private.current_couple_id()) and assigned_to = (select auth.uid()));

create policy "update own goals" on public.tasks
  for update to authenticated
  using (couple_id = (select private.current_couple_id()) and assigned_to = (select auth.uid()))
  with check (couple_id = (select private.current_couple_id()) and assigned_to = (select auth.uid()));

create policy "read couple proofs" on public.task_completions
  for select to authenticated
  using (task_id in (select id from public.tasks where couple_id = (select private.current_couple_id())));

create policy "read couple notes" on public.love_notes
  for select to authenticated
  using (couple_id = (select private.current_couple_id()));

create policy "send notes" on public.love_notes
  for insert to authenticated
  with check (couple_id = (select private.current_couple_id()) and sender_id = (select auth.uid()));

create policy "dismiss couple notes" on public.love_notes
  for update to authenticated
  using (couple_id = (select private.current_couple_id()))
  with check (couple_id = (select private.current_couple_id()));

-- Your own records always; your partner's only from the day your couple
-- began (a day early, since date_key is in each person's local calendar), so
-- a new partner never sees what you had scheduled with someone before.
create policy "read own and partner day schedules" on public.day_schedules
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.couples c
      where c.ended_at is null
        and (select auth.uid()) in (c.user1_id, c.user2_id)
        and day_schedules.user_id in (c.user1_id, c.user2_id)
        and day_schedules.date_key >= (c.created_at at time zone 'UTC')::date - 1
    )
  );

create policy "couple can read own completion photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'completion-photos'
    and (storage.foldername(name))[1] = (select private.current_couple_id())::text
  );

create policy "couple can upload own completion photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'completion-photos'
    and (storage.foldername(name))[1] = (select private.current_couple_id())::text
  );

-- ---------------------------------------------------------------- functions

create or replace function public.end_couple()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id into v_couple_id
  from public.couples
  where ended_at is null and auth.uid() in (user1_id, user2_id)
  for update;

  if not found then
    raise exception 'not paired';
  end if;

  update public.couples set ended_at = now() where id = v_couple_id;
end;
$$;

create or replace function public.generate_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if private.current_couple_id() is not null then
    raise exception 'already paired';
  end if;

  for i in 1..6 loop
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  end loop;

  -- "new code" invalidates any previous codes from this user
  update public.couple_invites set used = true where created_by = auth.uid() and not used;

  insert into public.couple_invites (code, created_by, expires_at, used)
  values (v_code, auth.uid(), now() + interval '1 year', false);

  return v_code;
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_invite public.couple_invites%rowtype;
  v_couple_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  if private.current_couple_id() is not null then
    raise exception 'already paired';
  end if;

  select * into v_invite
  from public.couple_invites
  where upper(code) = upper(trim(p_code)) and not used
  order by expires_at desc
  limit 1
  for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;
  if v_invite.created_by = v_me then
    raise exception 'cannot redeem your own invite';
  end if;

  -- Serialize anything that could pair either person, always locking the
  -- lower id first so two crossed redemptions cannot deadlock.
  perform pg_advisory_xact_lock(hashtextextended(least(v_me, v_invite.created_by)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_me, v_invite.created_by)::text, 0));

  if exists (select 1 from public.couples where ended_at is null and v_me in (user1_id, user2_id)) then
    raise exception 'already paired';
  end if;
  if exists (select 1 from public.couples where ended_at is null and v_invite.created_by in (user1_id, user2_id)) then
    raise exception 'inviter is already paired';
  end if;

  -- the same two people pairing again get their history back
  select id into v_couple_id
  from public.couples
  where ended_at is not null
    and ((user1_id = v_invite.created_by and user2_id = v_me)
      or (user1_id = v_me and user2_id = v_invite.created_by))
  order by ended_at desc
  limit 1
  for update;

  if found then
    update public.couples set ended_at = null where id = v_couple_id;
  else
    insert into public.couples (user1_id, user2_id)
    values (v_invite.created_by, v_me)
    returning id into v_couple_id;
  end if;

  -- Both people's outstanding codes die with the pairing. Otherwise a code
  -- one of them made earlier would pair them with a stranger after an unpair.
  update public.couple_invites
  set used = true
  where not used and created_by in (v_me, v_invite.created_by);

  return v_couple_id;
end;
$$;

create or replace function public.record_today_schedule()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_couple_id uuid;
  v_tz text;
  v_today date;
  v_dow int;
  v_ids uuid[];
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  -- Goals belong to a couple. With no active couple there is no schedule to
  -- freeze, and recording one would stamp empty days into a history the
  -- next couple's streak reads.
  v_couple_id := private.current_couple_id();
  if v_couple_id is null then
    return;
  end if;

  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_me;
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  -- freeze any unrecorded past days (up to 60 back) from the current
  -- schedule — the best guess available at first opportunity. Existing
  -- records are never touched, so frozen days stay frozen.
  insert into public.day_schedules (user_id, date_key, task_ids)
  select
    v_me,
    d.day::date,
    coalesce((
      select array_agg(t.id)
      from public.tasks t
      where t.assigned_to = v_me
        and t.couple_id = v_couple_id
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
    select 1 from public.day_schedules ds
    where ds.user_id = v_me and ds.date_key = d.day::date
  )
  on conflict (user_id, date_key) do nothing;

  -- today is still live, so it IS refreshed on every call
  v_dow := extract(dow from v_today); -- 0 = Sunday .. 6 = Saturday

  select coalesce(array_agg(id), '{}') into v_ids
  from public.tasks
  where assigned_to = v_me
    and couple_id = v_couple_id
    and archived_at is null
    and v_dow = any (scheduled_weekdays);

  insert into public.day_schedules (user_id, date_key, task_ids, updated_at)
  values (v_me, v_today, v_ids, now())
  on conflict (user_id, date_key)
  do update set task_ids = excluded.task_ids, updated_at = now();
end;
$$;

create or replace function public.submit_completion(p_task_id uuid, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_existing public.task_completions%rowtype;
  v_completion_id uuid;
  v_tz text;
  v_date date;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'task not found';
  end if;
  if v_task.archived_at is not null then
    raise exception 'goal is archived';
  end if;
  if v_task.assigned_to <> v_me then
    raise exception 'not your goal';
  end if;
  if v_task.couple_id is distinct from private.current_couple_id() then
    raise exception 'not authorized';
  end if;

  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_me;
  begin
    v_date := (now() at time zone v_tz)::date;
  exception when others then
    v_date := (now() at time zone 'UTC')::date;
  end;

  perform public.record_today_schedule();

  select * into v_existing from public.task_completions
    where task_id = p_task_id and scheduled_date = v_date
    for update;

  if found then
    if v_existing.status = 'approved' then
      raise exception 'already confirmed for this date';
    end if;
    update public.task_completions set photo_url = p_photo_path, submitted_at = now()
      where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into public.task_completions (task_id, submitted_by, photo_url, status, scheduled_date, submitted_at)
  values (p_task_id, v_me, p_photo_path, 'submitted', v_date, now())
  returning id into v_completion_id;

  return v_completion_id;
end;
$$;

create or replace function public.approve_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_completion public.task_completions%rowtype;
  v_couple_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select * into v_completion from public.task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion not found';
  end if;
  if v_completion.status <> 'submitted' then
    raise exception 'completion is not pending';
  end if;
  if v_completion.submitted_by = v_me then
    raise exception 'cannot confirm your own submission';
  end if;

  select couple_id into v_couple_id from public.tasks where id = v_completion.task_id;
  if v_couple_id is distinct from private.current_couple_id() then
    raise exception 'not authorized';
  end if;

  update public.task_completions set
    status = 'approved',
    reviewed_by = v_me,
    reviewed_at = now()
  where id = p_completion_id;
end;
$$;

-- my_couple_id() answered "any couple, ever" and was callable over the API.
-- Nothing calls it any more: policies and functions use the private helper.
drop function if exists public.my_couple_id();

revoke execute on function public.end_couple() from public, anon;
revoke execute on function public.generate_invite() from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.record_today_schedule() from public, anon;
revoke execute on function public.submit_completion(uuid, text) from public, anon;
revoke execute on function public.approve_completion(uuid) from public, anon;

grant execute on function public.end_couple() to authenticated;
grant execute on function public.generate_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.record_today_schedule() to authenticated;
grant execute on function public.submit_completion(uuid, text) to authenticated;
grant execute on function public.approve_completion(uuid) to authenticated;
