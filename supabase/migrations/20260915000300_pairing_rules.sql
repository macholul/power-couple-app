-- Who can pair, and how invite codes behave.
--
-- 1. A couple is a woman and a man. profiles.gender is new. Existing profiles
--    take it from the character picked at signup, the only signal there is;
--    on 2026-09-15 every couple in production was one of each. New signups
--    send it in their auth metadata. It cannot change while paired, or
--    pairing first and changing afterwards would get around the rule.
--
-- 2. Codes come from a strong random source. random() is a per-connection
--    generator and connections are pooled across users, so enough of one
--    person's codes could predict the next person's.
--
-- 3. Guessing is throttled. A code is 6 characters from 31, and a correct
--    guess pairs the guesser with a stranger. Each miss is recorded, and ten
--    in fifteen minutes refuses that account until they age out. A miss
--    returns null instead of raising: an exception would roll back the
--    record of the miss along with everything else.
--
-- 4. Codes last 7 days instead of a year, and spent codes are deleted instead
--    of kept as used: fewer live codes to guess at, and no rows with no
--    purpose. couple_invites.used stays, since the web app still filters on it.

-- ------------------------------------------------------------------- gender

alter table public.profiles add column gender text;

update public.profiles
set gender = case when avatar_character = 'baris' then 'male' else 'female' end;

alter table public.profiles
  alter column gender set not null,
  add constraint profiles_gender_check check (gender in ('female', 'male'));

create or replace function private.guard_profile_gender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- The web app's profile writes predate this column. Its upsert is an
    -- INSERT first, and NOT NULL is checked before the conflict is, so the
    -- row needs a gender even when it will turn into an update.
    if new.gender is null then
      new.gender := case when new.avatar_character = 'baris' then 'male' else 'female' end;
    end if;
    return new;
  end if;

  if new.gender is distinct from old.gender then
    -- the lock redeem_invite() takes on each person before reading genders
    perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));
    if exists (
      select 1 from public.couples
      where ended_at is null and new.id in (user1_id, user2_id)
    ) then
      raise exception 'cannot change gender while paired';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_profile_gender() from public;

create trigger profiles_gender_guard
  before insert or update of gender on public.profiles
  for each row execute function private.guard_profile_gender();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta constant jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_gender text := v_meta ->> 'gender';
  v_character text := v_meta ->> 'avatar_character';
begin
  -- Either may be missing: the web app sends only a character, and accounts
  -- made from the dashboard send neither. Each fills in the other.
  if v_character is null or v_character not in ('mae', 'baris') then
    v_character := case when v_gender = 'male' then 'baris' else 'mae' end;
  end if;
  if v_gender is null or v_gender not in ('female', 'male') then
    v_gender := case when v_character = 'baris' then 'male' else 'female' end;
  end if;

  insert into public.profiles (id, display_name, avatar_character, gender)
  values (
    new.id,
    coalesce(nullif(trim(v_meta ->> 'display_name'), ''), 'New User'),
    v_character,
    v_gender
  );
  return new;
end;
$$;

-- ------------------------------------------------------------------ invites

create or replace function private.random_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- no I, L, O, 0 or 1: codes get read out and typed
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_bytes bytea;
  v_byte int;
begin
  while length(v_code) < 6 loop
    v_bytes := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      -- bytes 6 and 8 carry the UUID's version and variant bits
      continue when i in (6, 8);
      v_byte := get_byte(v_bytes, i);
      -- 248 = 8 * 31; dropping the rest keeps every character equally likely
      continue when v_byte >= 248;
      v_code := v_code || substr(v_chars, 1 + v_byte % 31, 1);
      exit when length(v_code) = 6;
    end loop;
  end loop;
  return v_code;
end;
$$;

revoke execute on function private.random_invite_code() from public;

create table private.invite_misses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  missed_at timestamptz not null default now()
);

create index invite_misses_user_id_missed_at_idx on private.invite_misses (user_id, missed_at);

-- Only the invite functions touch it. RLS with no policies keeps it closed
-- even if a grant is added by mistake; the functions run as its owner.
alter table private.invite_misses enable row level security;
revoke all on table private.invite_misses from public, anon, authenticated;

delete from public.couple_invites where used or expires_at < now();
update public.couple_invites set expires_at = least(expires_at, now() + interval '7 days');

create or replace function public.generate_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
  v_code text;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  if private.current_couple_id() is not null then
    raise exception 'already paired';
  end if;

  -- a new code replaces this person's earlier ones
  delete from public.couple_invites where created_by = v_me;

  for attempt in 1..10 loop
    -- A code is the primary key, so one nobody can redeem any more (expired,
    -- or marked used by the old functions) is handed out again in place.
    insert into public.couple_invites as invite (code, created_by, expires_at, used)
    values (private.random_invite_code(), v_me, now() + interval '7 days', false)
    on conflict (code) do update
      set created_by = excluded.created_by,
          expires_at = excluded.expires_at,
          used = false
      where invite.used or invite.expires_at < now()
    returning invite.code into v_code;

    if found then
      return v_code;
    end if;
  end loop;

  raise exception 'could not make a code, try again';
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
  v_my_gender text;
  v_their_gender text;
  v_couple_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  -- One redemption at a time per person, so parallel requests cannot all
  -- pass the miss count before any miss is recorded. A key space of its own:
  -- the pairing locks below go in id order and must not interleave with it.
  perform pg_advisory_xact_lock(hashtextextended('redeem_invite:' || v_me::text, 0));

  if private.current_couple_id() is not null then
    raise exception 'already paired';
  end if;

  delete from private.invite_misses
  where user_id = v_me and missed_at <= now() - interval '15 minutes';
  if (select count(*) from private.invite_misses where user_id = v_me) >= 10 then
    raise exception 'too many tries, wait a few minutes and try again';
  end if;

  select * into v_invite
  from public.couple_invites
  where code = upper(trim(p_code)) and not used
  for update;

  if not found then
    insert into private.invite_misses (user_id) values (v_me);
    return null;
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

  -- Read under the locks: changing gender takes the same one, so neither
  -- person can change it between this check and the couple existing.
  select gender into v_my_gender from public.profiles where id = v_me;
  select gender into v_their_gender from public.profiles where id = v_invite.created_by;
  if v_my_gender is not distinct from v_their_gender then
    raise exception 'you can only pair with someone of the opposite gender';
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

  -- Both people's codes die with the pairing. Otherwise a code one of them
  -- made earlier would pair them with a stranger after an unpair.
  delete from public.couple_invites where created_by in (v_me, v_invite.created_by);

  return v_couple_id;
end;
$$;
