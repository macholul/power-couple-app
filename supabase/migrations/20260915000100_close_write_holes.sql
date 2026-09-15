-- Closes the write holes found while reconciling production with its
-- migrations. Every change here removes a capability neither app uses; the
-- tests in supabase/tests/security.test.ts show each hole on the baseline and
-- show it closed afterwards, alongside the flows that must keep working.

-- -------------------------------------------------------------------------
-- 1. Hand-made FOR ALL policies
--
-- Created in the SQL editor before any migration existed and never dropped.
-- With no WITH CHECK, Postgres reuses USING as the check, and permissive
-- policies are OR'd with the intended ones, so any member could write
-- anywhere in their own couple straight through the REST API:
--   - approve their own proof, bypassing approve_completion()
--   - insert or backdate completions to inflate a streak
--   - delete their partner's proofs
--   - edit or delete their partner's goals, bypassing "update own goals"
--
-- The reads they granted are already covered by "select own couple tasks" and
-- "select own couple completions", so dropping them removes only writes.
-- -------------------------------------------------------------------------

drop policy if exists "couple members access tasks" on public.tasks;
drop policy if exists "couple members access completions" on public.task_completions;

-- A word-for-word duplicate of "select own or partner profile". Harmless, but
-- every profile read paid for evaluating it twice.
drop policy if exists "view own or partner profile" on public.profiles;

-- -------------------------------------------------------------------------
-- 2. Love notes: dismissing must not mean rewriting
--
-- "dismiss couple notes" is FOR UPDATE with no WITH CHECK, so a member could
-- change the text of a note their partner sent — or its sender. Both apps
-- only ever set dismissed_at, so that is the only column left writable.
-- -------------------------------------------------------------------------

revoke update on public.love_notes from anon, authenticated;
grant update (dismissed_at) on public.love_notes to authenticated;

-- -------------------------------------------------------------------------
-- 3. Goals: owners edit what the editor edits, nothing else
--
-- "update own goals" limits WHICH rows; it cannot limit columns. created_at
-- feeds the streak math for days with no frozen schedule, so an owner could
-- move it to erase missed days. Both apps write only these four.
-- -------------------------------------------------------------------------

revoke update on public.tasks from anon, authenticated;
grant update (title, scheduled_weekdays, archived_at, updated_at) on public.tasks to authenticated;

-- -------------------------------------------------------------------------
-- 4. Functions callable without signing in
--
-- Every SECURITY DEFINER function in public was executable by anon, i.e. by
-- anyone holding the anon key that ships inside the app. Most then failed a
-- membership check, but generate_invite() did not: an anonymous caller got a
-- working code with no inviter, and redeeming it paired the victim with
-- nobody — permanently, since both invite functions then refuse them as
-- "already paired". Fixed twice over: anon loses EXECUTE, and the function
-- refuses a missing user itself (a grant can be re-added by mistake; a check
-- in the body cannot).
-- -------------------------------------------------------------------------

revoke execute on function public.generate_invite() from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.submit_completion(uuid, text) from public, anon;
revoke execute on function public.approve_completion(uuid) from public, anon;
revoke execute on function public.record_today_schedule() from public, anon;

grant execute on function public.generate_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.submit_completion(uuid, text) to authenticated;
grant execute on function public.approve_completion(uuid) to authenticated;
grant execute on function public.record_today_schedule() to authenticated;

create or replace function public.generate_invite()
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
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
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

-- No row may exist without the person it belongs to. Production has none
-- (checked 2026-09-15); these make the anonymous-invite state unrepresentable.
alter table public.couple_invites alter column created_by set not null;
alter table public.couples alter column user1_id set not null;
alter table public.couples alter column user2_id set not null;
alter table public.couples add constraint couples_distinct_members check (user1_id <> user2_id);
alter table public.tasks alter column couple_id set not null;
alter table public.tasks alter column assigned_to set not null;
alter table public.task_completions alter column task_id set not null;
alter table public.task_completions alter column submitted_by set not null;
alter table public.task_completions alter column status set not null;

-- -------------------------------------------------------------------------
-- 5. The signup trigger
--
-- handle_new_user() runs as its owner on every signup with no search_path, so
-- a role that can create objects earlier on the path could shadow "profiles".
-- It is a trigger, so nobody needs to be able to call it directly.
-- -------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'New User'));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
