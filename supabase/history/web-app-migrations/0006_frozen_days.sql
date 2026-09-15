-- Freeze each day's schedule so past days can never be rewritten.
--
-- The streak math used to judge every past day against the CURRENT goal
-- schedules, so editing a goal's weekdays retroactively changed history
-- (a fully-done day could flip to "missed"). day_schedules records which
-- goals were actually scheduled for a user on each of their local days;
-- once that day is over the record is immutable and streaks judge the day
-- only against it. Run in the Supabase SQL Editor after 0005.

create table if not exists day_schedules (
  user_id uuid not null references profiles (id) on delete cascade,
  date_key date not null,
  task_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

alter table day_schedules enable row level security;

-- both partners read both sides' records (needed for the couple streak/grid)
drop policy if exists "select couple day schedules" on day_schedules;
create policy "select couple day schedules" on day_schedules
  for select using (
    exists (
      select 1 from couples
      where (user1_id = auth.uid() or user2_id = auth.uid())
        and (user1_id = day_schedules.user_id or user2_id = day_schedules.user_id)
    )
  );

-- no insert/update/delete policies: rows are written only through the RPC
-- below, which can only ever touch the caller's CURRENT day — past days are
-- structurally unreachable, i.e. frozen.

create or replace function record_today_schedule()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    v_today := (now() at time zone 'UTC')::date;
  end;
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
$$;

grant execute on function record_today_schedule() to authenticated;

-- One-time backfill: freeze the last 60 days of history as currently judged
-- (past schedules can't be reconstructed, so each past day is snapshotted
-- from the goals' current weekdays with creation/archive cutoffs — same rule
-- the app used until now). From here on, future edits can't rewrite them.
insert into day_schedules (user_id, date_key, task_ids)
select
  p.id,
  d.day::date,
  coalesce((
    select array_agg(t.id)
    from tasks t
    where t.assigned_to = p.id
      and (t.created_at at time zone coalesce(p.timezone, 'UTC'))::date <= d.day::date
      and (t.archived_at is null
           or (t.archived_at at time zone coalesce(p.timezone, 'UTC'))::date > d.day::date)
      and extract(dow from d.day::date) = any (t.scheduled_weekdays)
  ), '{}')
from profiles p
cross join lateral generate_series(
  ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 60)::timestamp,
  ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 1)::timestamp,
  interval '1 day'
) as d(day)
on conflict (user_id, date_key) do nothing;

-- submitting a proof also refreshes the day's record, so days with activity
-- are always captured even if the home screen wasn't reloaded
create or replace function submit_completion(p_task_id uuid, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function submit_completion(uuid, text) to authenticated;
