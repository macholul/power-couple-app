-- Characters people choose: a few ready-made ones per gender, picked at
-- sign-up and changeable in account settings.
--
-- Until now a woman was always Mae and a man always Baris, and
-- profiles_avatar_character_check allowed only those two. private.characters
-- now lists every character with the one gender that may use it, and a
-- two-column foreign key holds each profile to a character of its own gender.
-- The app ships the images, so a character the app offers needs its row here
-- first; adding one is a single insert.
--
-- The database keeps a profile's character fitting without the apps' help:
--
-- - At sign-up, a character that doesn't fit the gender, or none, becomes
--   the gender's default.
-- - A gender change, allowed while unpaired, switches to the new gender's
--   default unless a fitting character is set in the same update.
-- - Choosing a character that doesn't fit is refused, not quietly replaced:
--   the choice was explicit, so the person should see it fail.

create table private.characters (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{0,31}$'),
  gender text not null check (gender in ('female', 'male')),
  is_default boolean not null default false,
  constraint characters_key_gender_key unique (key, gender)
);

-- exactly one default per gender, which is what a profile falls back to
create unique index characters_one_default_per_gender on private.characters (gender) where is_default;

-- Read only through the foreign key and the functions below. RLS with no
-- policies keeps it closed even if a grant is added by mistake.
alter table private.characters enable row level security;
revoke all on table private.characters from public, anon, authenticated;

insert into private.characters (key, gender, is_default) values
  ('mae', 'female', true),
  ('baris', 'male', true);

-- Production had no profile whose character didn't fit its gender on
-- 2026-09-22; this makes sure of it before the key goes on.
update public.profiles p
set avatar_character = case p.gender when 'male' then 'baris' else 'mae' end
where not exists (
  select 1 from private.characters c where c.key = p.avatar_character and c.gender = p.gender
);

alter table public.profiles drop constraint profiles_avatar_character_check;
create index profiles_avatar_character_gender_idx on public.profiles (avatar_character, gender);
alter table public.profiles
  add constraint profiles_character_fits_gender
  foreign key (avatar_character, gender) references private.characters (key, gender);

create or replace function private.match_profile_character()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.characters
    where key = new.avatar_character and gender = new.gender
  ) then
    return new;
  end if;

  -- a character chosen in this update: the foreign key refuses it
  if tg_op = 'UPDATE' and new.avatar_character is distinct from old.avatar_character then
    return new;
  end if;

  -- A gender with no default is not a gender profiles allow: leave the
  -- character, so profiles_gender_check is the error that reports it.
  new.avatar_character := coalesce(
    (select key from private.characters where gender = new.gender and is_default),
    new.avatar_character
  );
  return new;
end;
$$;

revoke execute on function private.match_profile_character() from public;

-- Triggers on the same event run in name order, and this one must come after
-- profiles_gender_guard, which fills in a missing gender first.
create trigger profiles_match_character
  before insert or update of gender, avatar_character on public.profiles
  for each row execute function private.match_profile_character();

-- A missing gender now comes from the character's row, which knows every
-- character, rather than from a check for 'baris'.
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
      select c.gender into new.gender from private.characters c where c.key = new.avatar_character;
      new.gender := coalesce(new.gender, 'female');
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
  v_name text := btrim(left(btrim(coalesce(v_meta ->> 'display_name', '')), 30));
begin
  -- Either may be missing: accounts made from the dashboard send neither, and
  -- the old web app sent only a character. A missing gender comes from the
  -- character; a character the gender can't use becomes the gender's default
  -- in private.match_profile_character().
  if v_gender is null or v_gender not in ('female', 'male') then
    select c.gender into v_gender from private.characters c where c.key = v_character;
    v_gender := coalesce(v_gender, 'female');
  end if;

  insert into public.profiles (id, display_name, avatar_character, gender)
  values (new.id, coalesce(nullif(v_name, ''), 'New User'), v_character, v_gender);
  return new;
end;
$$;
