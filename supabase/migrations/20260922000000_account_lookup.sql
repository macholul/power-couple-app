-- Lets the password reset screen say when no account uses the email typed,
-- instead of promising a code that will never come.
--
-- Supabase's reset endpoint hides whether an account exists, on purpose. Its
-- sign-up endpoint does not: with phone confirmation off, signing up with a
-- taken email fails with "User already registered", and even with it on, the
-- reply's empty identities list gives it away. So the vague reset message
-- protected nothing.
--
-- Only the account-exists Edge Function calls this, with the secret key:
-- signed-out callers must not run definer functions (advisor 0028,
-- invariants.test.ts). The whole project gets 30 answers per 15 minutes, far
-- more than people resetting passwords need, which keeps this from being a
-- faster way to test lists of addresses than signing up. Past the cap the
-- answer is null and the app falls back to its neutral message, so nobody is
-- ever kept from resetting. The record holds only when each lookup happened:
-- no email, no network address.

create table private.account_lookups (
  id bigint generated always as identity primary key,
  looked_at timestamptz not null default now()
);

create index account_lookups_looked_at_idx on private.account_lookups (looked_at);

-- Only the function touches it. RLS with no policies keeps it closed even if
-- a grant is added by mistake; the function runs as its owner.
alter table private.account_lookups enable row level security;
revoke all on table private.account_lookups from public, anon, authenticated;

create or replace function public.account_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One lookup at a time, so parallel calls cannot all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('account_exists', 0));

  delete from private.account_lookups where looked_at <= now() - interval '15 minutes';
  if (select count(*) from private.account_lookups) >= 30 then
    return null;
  end if;
  insert into private.account_lookups default values;

  return exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
end;
$$;

revoke execute on function public.account_exists(text) from public, anon, authenticated;
grant execute on function public.account_exists(text) to service_role;
