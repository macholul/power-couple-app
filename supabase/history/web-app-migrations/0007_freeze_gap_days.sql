-- Close the freezing gap left by 0006: days nobody opened the app on were
-- never frozen, so streaks still judged them against the CURRENT goal
-- schedules — adding a goal to Friday could flip a finished, unrecorded
-- Friday to "missed".
--
-- 0006 backfilled history up to the day before it ran, and freezes "today"
-- whenever the app is used. Any day between the two (the migration day
-- itself, or a day a partner never opened the app) got no record and stayed
-- rewritable. Two fixes here:
--   1. record_today_schedule now also freezes any still-unrecorded past
--      days before writing today, so gaps close on the next app open.
--   2. A one-time heal freezes the gaps that already exist, giving the
--      benefit of the doubt to goals whose schedule was edited after the
--      day in question.
-- Run in the Supabase SQL Editor after 0006.

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
$$;

grant execute on function record_today_schedule() to authenticated;

-- One-time heal of the gaps that already exist. Same snapshot rule as the
-- 0006 backfill, with one refinement: a goal whose row was edited AFTER the
-- day in question, and which has no proof submitted ON that day, is left out
-- of the snapshot — we can't know whether it was scheduled that day back
-- then, and demanding it retroactively is exactly the bug being fixed.
-- Goals with a submitted/approved proof that day are kept (the proof shows
-- they were live), so real misses and late confirmations still work.
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
      and not (
        (t.updated_at at time zone coalesce(p.timezone, 'UTC'))::date > d.day::date
        and not exists (
          select 1 from task_completions c
          where c.task_id = t.id and c.scheduled_date = d.day::date
        )
      )
  ), '{}')
from profiles p
cross join lateral generate_series(
  ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 60)::timestamp,
  ((now() at time zone coalesce(p.timezone, 'UTC'))::date - 1)::timestamp,
  interval '1 day'
) as d(day)
on conflict (user_id, date_key) do nothing;
