-- Limits on what a client can store, enforced where every client meets them.
--
-- The apps checked some of these and not others, and nothing stopped a
-- direct API call from storing a megabyte where a name goes. Each limit is
-- far above what production held on 2026-09-15 (longest name 10 characters,
-- goal 19, note 12) and matches the app's own input limit.

alter table public.profiles
  add constraint profiles_display_name_length
    check (char_length(display_name) <= 30 and btrim(display_name) <> ''),
  add constraint profiles_timezone_length
    check (char_length(timezone) between 1 and 64);

alter table public.tasks
  add constraint tasks_title_length
    check (char_length(title) <= 60 and btrim(title) <> ''),
  -- both apps always send at least one day, each 0 (Sunday) to 6
  add constraint tasks_scheduled_weekdays_valid
    check (cardinality(scheduled_weekdays) > 0 and scheduled_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]);

alter table public.love_notes
  add constraint love_notes_text_length
    check (char_length(text) <= 80 and btrim(text) <> '');

-- The web app's signup form has no length limit, and a name over the limit
-- would now fail the whole signup inside this trigger. Shorten it instead.
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
  -- Either may be missing: the web app sends only a character, and accounts
  -- made from the dashboard send neither. Each fills in the other.
  if v_character is null or v_character not in ('mae', 'baris') then
    v_character := case when v_gender = 'male' then 'baris' else 'mae' end;
  end if;
  if v_gender is null or v_gender not in ('female', 'male') then
    v_gender := case when v_character = 'baris' then 'male' else 'female' end;
  end if;

  insert into public.profiles (id, display_name, avatar_character, gender)
  values (new.id, coalesce(nullif(v_name, ''), 'New User'), v_character, v_gender);
  return new;
end;
$$;
