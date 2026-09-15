-- Power Couple v1 schema migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor) against the existing project.
-- Assumes the following tables already exist: profiles, couples, couple_invites, tasks, task_completions.

-- =========================================================================
-- 1. Column changes
-- =========================================================================

alter table tasks drop column if exists frequency;
alter table tasks add column if not exists scheduled_weekdays smallint[] not null default '{}';
  -- 0 = Sunday .. 6 = Saturday, matches JS Date.getDay() and Postgres extract(dow from date)
alter table tasks add column if not exists freezes_available smallint not null default 1;
alter table tasks add column if not exists freezes_used_this_period smallint not null default 0;
alter table tasks add column if not exists freeze_period_start date not null default date_trunc('month', now())::date;
alter table tasks add column if not exists last_reconciled_date date;

alter table task_completions add column if not exists review_note text;
alter table task_completions add column if not exists scheduled_date date not null default current_date;
alter table task_completions add column if not exists attempt_count smallint not null default 1;
alter table task_completions alter column status set default 'submitted';

do $$ begin
  alter table task_completions
    add constraint task_completions_status_check
    check (status in ('submitted', 'approved', 'changes_requested'));
exception when duplicate_object then null;
end $$;

create table if not exists task_streak_freezes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  frozen_date date not null,
  created_at timestamptz not null default now(),
  unique (task_id, frozen_date)
);

-- =========================================================================
-- 2. Row Level Security
-- =========================================================================

alter table profiles enable row level security;
alter table couples enable row level security;
alter table couple_invites enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table task_streak_freezes enable row level security;

create or replace function my_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from couples
  where user1_id = auth.uid() or user2_id = auth.uid()
  limit 1;
$$;

drop policy if exists "select own or partner profile" on profiles;
create policy "select own or partner profile" on profiles
  for select using (
    id = auth.uid()
    or id in (
      select case when user1_id = auth.uid() then user2_id else user1_id end
      from couples
      where user1_id = auth.uid() or user2_id = auth.uid()
    )
  );

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles
  for insert with check (id = auth.uid());

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update using (id = auth.uid());

drop policy if exists "select own couple" on couples;
create policy "select own couple" on couples
  for select using (user1_id = auth.uid() or user2_id = auth.uid());
  -- no insert/update/delete policy: couples rows are only created via redeem_invite()

drop policy if exists "select own invites" on couple_invites;
create policy "select own invites" on couple_invites
  for select using (created_by = auth.uid());
  -- no insert/update policy: invites are only created/redeemed via generate_invite()/redeem_invite()

drop policy if exists "select own couple tasks" on tasks;
create policy "select own couple tasks" on tasks
  for select using (couple_id = my_couple_id());

drop policy if exists "insert own couple tasks" on tasks;
create policy "insert own couple tasks" on tasks
  for insert with check (couple_id = my_couple_id() and created_by = auth.uid());

drop policy if exists "update own couple tasks" on tasks;
create policy "update own couple tasks" on tasks
  for update using (couple_id = my_couple_id());

drop policy if exists "select own couple completions" on task_completions;
create policy "select own couple completions" on task_completions
  for select using (task_id in (select id from tasks where couple_id = my_couple_id()));
  -- no insert/update policy: all completion mutations go through the RPCs below,
  -- which enforce "can't approve/reject your own submission" and require a rejection note.

drop policy if exists "select own couple freezes" on task_streak_freezes;
create policy "select own couple freezes" on task_streak_freezes
  for select using (task_id in (select id from tasks where couple_id = my_couple_id()));
  -- no insert/update policy: only written by reconcile_task_streak()

-- =========================================================================
-- 3. Pairing RPCs
-- =========================================================================

create or replace function generate_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if my_couple_id() is not null then
    raise exception 'already paired';
  end if;

  v_code := encode(gen_random_bytes(6), 'hex');

  insert into couple_invites (code, created_by, expires_at, used)
  values (v_code, auth.uid(), now() + interval '1 hour', false);

  return v_code;
end;
$$;

create or replace function redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite couple_invites%rowtype;
  v_couple_id uuid;
begin
  if my_couple_id() is not null then
    raise exception 'already paired';
  end if;

  select * into v_invite from couple_invites
    where code = p_code for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.used then
    raise exception 'invite already used';
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

  update couple_invites set used = true where code = p_code;

  return v_couple_id;
end;
$$;

-- =========================================================================
-- 4. Streak reconciliation
-- =========================================================================

create or replace function reconcile_task_streak(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_cursor date;
  v_today date := current_date;
  v_has_completion boolean;
begin
  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found';
  end if;

  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  v_cursor := coalesce(v_task.last_reconciled_date, v_task.created_at::date) + 1;

  while v_cursor < v_today loop
    if extract(dow from v_cursor)::smallint = any(v_task.scheduled_weekdays) then
      if v_cursor >= (v_task.freeze_period_start + interval '1 month')::date then
        v_task.freeze_period_start := date_trunc('month', v_cursor)::date;
        v_task.freezes_used_this_period := 0;
      end if;

      select exists (
        select 1 from task_completions
        where task_id = p_task_id and scheduled_date = v_cursor and status = 'approved'
      ) into v_has_completion;

      if v_has_completion then
        v_task.current_streak := v_task.current_streak + 1;
      elsif v_task.freezes_used_this_period < v_task.freezes_available then
        v_task.freezes_used_this_period := v_task.freezes_used_this_period + 1;
        insert into task_streak_freezes (task_id, frozen_date)
          values (p_task_id, v_cursor)
          on conflict (task_id, frozen_date) do nothing;
      else
        v_task.best_streak := greatest(v_task.best_streak, v_task.current_streak);
        v_task.current_streak := 0;
      end if;
    end if;
    v_cursor := v_cursor + 1;
  end loop;

  v_task.best_streak := greatest(v_task.best_streak, v_task.current_streak);
  v_task.last_reconciled_date := v_today - 1;

  update tasks set
    current_streak = v_task.current_streak,
    best_streak = v_task.best_streak,
    freezes_used_this_period = v_task.freezes_used_this_period,
    freeze_period_start = v_task.freeze_period_start,
    last_reconciled_date = v_task.last_reconciled_date,
    updated_at = now()
  where id = p_task_id;
end;
$$;

-- =========================================================================
-- 5. Completion workflow RPCs
-- =========================================================================

create or replace function submit_completion(p_task_id uuid, p_scheduled_date date, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_completion_id uuid;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'task not found';
  end if;
  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;
  if exists (
    select 1 from task_completions
    where task_id = p_task_id and scheduled_date = p_scheduled_date and status = 'approved'
  ) then
    raise exception 'already approved for this date';
  end if;

  insert into task_completions (task_id, submitted_by, photo_url, status, scheduled_date, submitted_at)
  values (p_task_id, auth.uid(), p_photo_path, 'submitted', p_scheduled_date, now())
  returning id into v_completion_id;

  return v_completion_id;
end;
$$;

create or replace function resubmit_completion(p_completion_id uuid, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion task_completions%rowtype;
begin
  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion not found';
  end if;
  if v_completion.submitted_by <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_completion.status <> 'changes_requested' then
    raise exception 'completion is not awaiting resubmission';
  end if;

  update task_completions set
    photo_url = p_photo_path,
    status = 'submitted',
    attempt_count = attempt_count + 1,
    submitted_at = now()
  where id = p_completion_id;
end;
$$;

create or replace function approve_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'cannot approve your own submission';
  end if;

  select * into v_task from tasks where id = v_completion.task_id;
  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  perform reconcile_task_streak(v_completion.task_id);

  update task_completions set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_completion_id;

  if v_completion.scheduled_date = current_date then
    update tasks set
      current_streak = current_streak + 1,
      best_streak = greatest(best_streak, current_streak + 1),
      updated_at = now()
    where id = v_completion.task_id;
  end if;
end;
$$;

create or replace function reject_completion(p_completion_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion task_completions%rowtype;
  v_task tasks%rowtype;
begin
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'a note is required to reject a completion';
  end if;

  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion not found';
  end if;
  if v_completion.status <> 'submitted' then
    raise exception 'completion is not pending';
  end if;
  if v_completion.submitted_by = auth.uid() then
    raise exception 'cannot review your own submission';
  end if;

  select * into v_task from tasks where id = v_completion.task_id;
  if not exists (
    select 1 from couples
    where id = v_task.couple_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  update task_completions set
    status = 'changes_requested',
    review_note = p_note,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_completion_id;
end;
$$;

grant execute on function my_couple_id() to authenticated;
grant execute on function generate_invite() to authenticated;
grant execute on function redeem_invite(text) to authenticated;
grant execute on function reconcile_task_streak(uuid) to authenticated;
grant execute on function submit_completion(uuid, date, text) to authenticated;
grant execute on function resubmit_completion(uuid, text) to authenticated;
grant execute on function approve_completion(uuid) to authenticated;
grant execute on function reject_completion(uuid, text) to authenticated;

-- =========================================================================
-- 6. Storage bucket for completion photos
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('completion-photos', 'completion-photos', false)
on conflict (id) do nothing;

drop policy if exists "couple can read own completion photos" on storage.objects;
create policy "couple can read own completion photos" on storage.objects
  for select using (
    bucket_id = 'completion-photos'
    and exists (
      select 1 from couples
      where id::text = (storage.foldername(name))[1]
        and (user1_id = auth.uid() or user2_id = auth.uid())
    )
  );

drop policy if exists "couple can upload own completion photos" on storage.objects;
create policy "couple can upload own completion photos" on storage.objects
  for insert with check (
    bucket_id = 'completion-photos'
    and exists (
      select 1 from couples
      where id::text = (storage.foldername(name))[1]
        and (user1_id = auth.uid() or user2_id = auth.uid())
    )
  );
