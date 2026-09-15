-- Proof photos: what the bucket accepts, where a proof may point, and who can
-- clean up.
--
-- 1. The bucket accepted any file of any size, up to the project's global
--    limit. Both apps upload a JPEG at most 600 px on its long edge; the
--    largest in production was 216 KB. Now: JPEG only, 2 MB at most.
--
-- 2. submit_completion() stored whatever path it was given. A proof now has
--    to point into its own goal's folder, <couple id>/<goal id>/<file>, which
--    is where the upload policy puts photos and where cleanup and account
--    deletion look for them.
--
-- 3. One proof per goal per day was only checked by reading first, so two
--    submits at once could both insert. A unique constraint makes it a rule,
--    and the function now upserts against it.
--
-- 4. Retaking a proof points it at a new photo, and nothing could delete the
--    old one: production had 8 such orphans. The person who uploaded a photo
--    can now delete it while it is in their current couple's folder and no
--    proof points at it. A photo a proof uses cannot be deleted this way.

update storage.buckets
set file_size_limit = 2 * 1024 * 1024, -- bytes
    allowed_mime_types = array['image/jpeg']
where id = 'completion-photos';

alter table public.task_completions
  add constraint task_completions_task_id_scheduled_date_key unique (task_id, scheduled_date);

-- the delete policy below looks proofs up by photo
create index task_completions_photo_url_idx on public.task_completions (photo_url);

create policy "uploader can delete own unused completion photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'completion-photos'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select private.current_couple_id())::text
    and not exists (
      select 1 from public.task_completions proof where proof.photo_url = objects.name
    )
  );

create or replace function public.submit_completion(p_task_id uuid, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_task public.tasks%rowtype;
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
  -- ids are hex and hyphens, so they are literal inside the pattern
  if p_photo_path is null
     or p_photo_path !~ ('^' || v_task.couple_id::text || '/' || v_task.id::text || '/[^/]+$') then
    raise exception 'invalid photo path';
  end if;

  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_me;
  begin
    v_date := (now() at time zone v_tz)::date;
  exception when others then
    v_date := (now() at time zone 'UTC')::date;
  end;

  perform public.record_today_schedule();

  -- a retake replaces a pending proof; a confirmed one is final
  insert into public.task_completions as proof
    (task_id, submitted_by, photo_url, status, scheduled_date, submitted_at)
  values (p_task_id, v_me, p_photo_path, 'submitted', v_date, now())
  on conflict (task_id, scheduled_date) do update
    set photo_url = excluded.photo_url,
        submitted_at = excluded.submitted_at
    where proof.status = 'submitted'
  returning proof.id into v_completion_id;

  if not found then
    raise exception 'already confirmed for this date';
  end if;
  return v_completion_id;
end;
$$;
