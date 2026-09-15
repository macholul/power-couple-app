-- What deleting an account has to remove from Storage.
--
-- Deleting the auth user cascades through every table: the profile, every
-- couple the person was ever in, and with those couples both partners'
-- goals, proofs and notes. A couple is shared, so it goes when either
-- partner leaves the app, and the partner is left unpaired and free to pair
-- again.
--
-- Photos are the exception. They are files behind the Storage API, not rows
-- Postgres can cascade to, and deleting their rows in SQL would leave the
-- files in the bucket. So the delete-account Edge Function asks for this list,
-- removes the files through the API, and only then deletes the user. Only the
-- service role (the function's key) may ask.

create or replace function public.account_photo_paths(p_user_id uuid)
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'completion-photos'
    and (storage.foldername(o.name))[1] in (
      select c.id::text
      from public.couples c
      where p_user_id in (c.user1_id, c.user2_id)
    )
  order by o.name;
$$;

revoke execute on function public.account_photo_paths(uuid) from public, anon, authenticated;
grant execute on function public.account_photo_paths(uuid) to service_role;
