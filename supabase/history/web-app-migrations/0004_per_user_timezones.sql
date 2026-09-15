-- Per-user timezones: each partner's "day" follows their own local calendar
-- (long-distance mode). Run in the Supabase SQL Editor after 0003.

alter table profiles add column if not exists timezone text not null default 'UTC';

-- submit_completion now stamps the scheduled date itself, using the
-- submitter's stored timezone, so the app can't mis-stamp a day.
drop function if exists submit_completion(uuid, date, text);

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
