-- Power Couple design renovation migration
-- Run in the Supabase SQL Editor after 0001_v1_schema.sql.
-- Changes: confirm-only completions (no reject/resubmit), no streak freezes,
-- self-owned goals, character selection, love notes, persistent 6-char invites.

-- =========================================================================
-- 1. Drop retired machinery
-- =========================================================================

drop function if exists reconcile_task_streak(uuid);
drop function if exists reject_completion(uuid, text);
drop function if exists resubmit_completion(uuid, text);
drop table if exists task_streak_freezes;

-- old task policies must go before the columns they reference
drop policy if exists "insert own couple tasks" on tasks;
drop policy if exists "update own couple tasks" on tasks;

-- any in-flight rejections become plain pending submissions
update task_completions set status = 'submitted' where status = 'changes_requested';

alter table task_completions drop constraint if exists task_completions_status_check;
alter table task_completions
  add constraint task_completions_status_check
  check (status in ('submitted', 'approved'));

alter table task_completions drop column if exists review_note;
alter table task_completions drop column if exists attempt_count;

alter table tasks drop column if exists current_streak;
alter table tasks drop column if exists best_streak;
alter table tasks drop column if exists freezes_available;
alter table tasks drop column if exists freezes_used_this_period;
alter table tasks drop column if exists freeze_period_start;
alter table tasks drop column if exists last_reconciled_date;
alter table tasks drop column if exists description;
alter table tasks drop column if exists is_active;
alter table tasks drop column if exists created_by;
-- tasks.assigned_to is now simply the goal's owner

-- goals are hard-deleted from the profile editor; completions go with them
alter table task_completions drop constraint if exists task_completions_task_id_fkey;
alter table task_completions
  add constraint task_completions_task_id_fkey
  foreign key (task_id) references tasks(id) on delete cascade;

-- =========================================================================
-- 2. Character selection (pink Mae / blue Baris)
-- =========================================================================

alter table profiles add column if not exists avatar_character text not null default 'mae';
do $$ begin
  alter table profiles
    add constraint profiles_avatar_character_check
    check (avatar_character in ('mae', 'baris'));
exception when duplicate_object then null;
end $$;

-- =========================================================================
-- 3. Task (goal) policies: owner-managed
-- =========================================================================

drop policy if exists "insert own goals" on tasks;
create policy "insert own goals" on tasks
  for insert with check (couple_id = my_couple_id() and assigned_to = auth.uid());

drop policy if exists "update own goals" on tasks;
create policy "update own goals" on tasks
  for update using (couple_id = my_couple_id() and assigned_to = auth.uid());

drop policy if exists "delete own goals" on tasks;
create policy "delete own goals" on tasks
  for delete using (couple_id = my_couple_id() and assigned_to = auth.uid());

-- =========================================================================
-- 4. Love notes (encouragements shown as speech bubbles)
-- =========================================================================

create table if not exists love_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

alter table love_notes enable row level security;

drop policy if exists "select couple notes" on love_notes;
create policy "select couple notes" on love_notes
  for select using (couple_id = my_couple_id());

drop policy if exists "send note" on love_notes;
create policy "send note" on love_notes
  for insert with check (couple_id = my_couple_id() and sender_id = auth.uid());

drop policy if exists "dismiss couple notes" on love_notes;
create policy "dismiss couple notes" on love_notes
  for update using (couple_id = my_couple_id());

-- =========================================================================
-- 5. Invites: persistent, friendly 6-char codes
-- =========================================================================

create or replace function generate_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- redemption is case-insensitive on the pasted code
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
$$;

-- =========================================================================
-- 6. Completion RPCs: submit (replaces pending photo) + confirm
-- =========================================================================

create or replace function submit_completion(p_task_id uuid, p_scheduled_date date, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_existing task_completions%rowtype;
  v_completion_id uuid;
begin
  select * into v_task from tasks where id = p_task_id;
  if not found then
    raise exception 'task not found';
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

  select * into v_existing from task_completions
    where task_id = p_task_id and scheduled_date = p_scheduled_date
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
  values (p_task_id, auth.uid(), p_photo_path, 'submitted', p_scheduled_date, now())
  returning id into v_completion_id;

  return v_completion_id;
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
$$;
