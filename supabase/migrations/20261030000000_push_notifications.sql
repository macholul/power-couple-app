-- Push notifications: what a phone registers, what is waiting to be sent, and
-- the rules about when someone is worth interrupting.
--
-- Nothing here sends anything. Postgres cannot reach Apple, so the `push`
-- Edge Function does the sending; this file decides what gets sent. Every
-- notification is a row in private.push_outbox, written by a trigger on the
-- thing that happened, and the function drains the queue. Queueing rather
-- than calling out means three things:
--   - the decision is in SQL, so supabase/tests/push.test.ts can check it;
--   - a notification cannot be lost because the app was killed a moment after
--     the write, the way a send from the phone could be;
--   - nothing a user is waiting on ever waits on Apple.
--
-- Everything goes through private.enqueue_push(), which drops a notification
-- unless all three of these hold: the recipient wants that kind, they have a
-- device registered, and this exact notification has not been queued before.
-- The last one is what stops a retaken proof, a repeated cron tick or a
-- redelivery from arriving twice.
--
-- The notification itself leaves our servers: the function hands it to Expo's
-- push service, which hands it to Apple. Titles and bodies carry a first name
-- and, for a note, the note's text, so the privacy policy names both
-- companies and says what they receive.

-- =============================================================== what a
-- phone registers

-- The token is the primary key, not the user: a phone has exactly one, and
-- when someone else signs in on the same phone the row moves to them instead
-- of leaving two owners for one device. Expo's tokens look like
-- "ExponentPushToken[...]", but that shape is theirs to change, so only the
-- length is pinned down here.
create table private.push_devices (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

alter table private.push_devices
  add constraint push_devices_token_length check (char_length(token) between 10 and 200),
  add constraint push_devices_platform_valid check (platform in ('ios', 'android'));

create index push_devices_user_id_idx on private.push_devices (user_id);

-- Only the functions below touch it. Row level security with no policies keeps
-- it closed even if a grant is ever added by mistake.
alter table private.push_devices enable row level security;
revoke all on table private.push_devices from public, anon, authenticated;

-- =============================================================== what is
-- waiting to be sent

create table private.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  /** what the app reads when the notification is tapped */
  payload jsonb not null default '{}'::jsonb,
  /**
   * What makes this notification one of a kind: the completion's id, the
   * note's id, or the local date for a daily reminder. A second attempt to
   * queue the same one is dropped.
   */
  dedupe text not null,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0,
  last_error text
);

alter table private.push_outbox
  add constraint push_outbox_kind_valid
    check (kind in ('proof', 'confirmed', 'note', 'reminder')),
  add constraint push_outbox_title_length check (char_length(title) between 1 and 100),
  add constraint push_outbox_body_length check (char_length(body) between 1 and 180),
  add constraint push_outbox_dedupe_length check (char_length(dedupe) between 1 and 60);

-- Both the "only once" rule and the index the recipient foreign key needs.
create unique index push_outbox_once_idx
  on private.push_outbox (recipient_id, kind, dedupe);

-- The drain reads only this end of the table.
create index push_outbox_pending_idx on private.push_outbox (id) where sent_at is null;

alter table private.push_outbox enable row level security;
revoke all on table private.push_outbox from public, anon, authenticated;

-- ================================================================ what each
-- person wants

-- Defaults are on, because someone who installs an app for two people has
-- already said yes to hearing from their partner — and iOS asks for its own
-- permission before any of this matters. The hour is the person's own, in
-- their own timezone; the app does not offer to change it yet.
alter table public.profiles
  add column notify_proofs boolean not null default true,
  add column notify_notes boolean not null default true,
  add column notify_streak boolean not null default true,
  add column reminder_hour smallint not null default 20;

alter table public.profiles
  add constraint profiles_reminder_hour_valid check (reminder_hour between 0 and 23);

-- ===================================================================== helpers

/** The other half of someone's active couple, looked up without a session. */
create or replace function private.partner_of(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when user1_id = p_user_id then user2_id else user1_id end
  from public.couples
  where ended_at is null
    and p_user_id in (user1_id, user2_id)
  limit 1;
$$;

revoke execute on function private.partner_of(uuid) from public;

/**
 * Now, on someone's own clock. A timezone the phone reported but Postgres
 * does not know would otherwise raise, the same way it would in
 * submit_completion(), so it falls back to UTC rather than failing.
 */
create or replace function private.local_now(p_tz text)
returns timestamp
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return now() at time zone coalesce(p_tz, 'UTC');
exception when others then
  return now() at time zone 'UTC';
end;
$$;

revoke execute on function private.local_now(text) from public;

/**
 * Queues one notification, or decides not to. Returns whether a row was
 * written, which is what the reminder sweep counts.
 *
 * Titles and bodies are trimmed to what the columns hold rather than
 * rejected: a goal title can be 60 characters, and a notification is never
 * worth failing the write that caused it.
 */
create or replace function private.enqueue_push(
  p_recipient uuid,
  p_kind text,
  p_dedupe text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted boolean;
begin
  if p_recipient is null or p_dedupe is null then
    return false;
  end if;

  select case p_kind
           when 'note' then notify_notes
           when 'reminder' then notify_streak
           else notify_proofs
         end
    into v_wanted
  from public.profiles
  where id = p_recipient;
  if not coalesce(v_wanted, false) then
    return false;
  end if;

  -- Nobody to send to is not something to remember: notifications are only
  -- ever about right now, so a phone registered later should not get them.
  if not exists (select 1 from private.push_devices where user_id = p_recipient) then
    return false;
  end if;

  insert into private.push_outbox (recipient_id, kind, dedupe, title, body, payload)
  values (
    p_recipient,
    p_kind,
    left(p_dedupe, 60),
    left(coalesce(nullif(btrim(p_title), ''), 'powercouple'), 100),
    left(coalesce(nullif(btrim(p_body), ''), 'open the app'), 180),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (recipient_id, kind, dedupe) do nothing;

  return found;
end;
$$;

revoke execute on function private.enqueue_push(uuid, text, text, text, text, jsonb) from public;

-- =================================================================== triggers

/** A proof arrives: tell the partner, who is the one who confirms it. */
create or replace function private.push_on_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_partner constant uuid := private.partner_of(new.submitted_by);
  v_name text;
begin
  if new.status <> 'submitted' or v_partner is null then
    return new;
  end if;

  select title into v_title from public.tasks where id = new.task_id;
  if v_title is null then
    return new;
  end if;
  select display_name into v_name from public.profiles where id = new.submitted_by;

  perform private.enqueue_push(
    v_partner,
    'proof',
    new.id::text,
    coalesce(v_name, 'your partner') || ' finished a goal',
    '“' || v_title || '” is waiting for you to confirm',
    jsonb_build_object('kind', 'proof', 'completionId', new.id)
  );
  return new;
end;
$$;

revoke execute on function private.push_on_proof() from public;

-- A retake is an update to the same row, and the queue drops it as a repeat,
-- so one proof is one notification however many photos it took.
create trigger task_completions_push_on_proof
  after insert or update of photo_url on public.task_completions
  for each row execute function private.push_on_proof();

/** It was confirmed: tell whoever sent the proof. */
create or replace function private.push_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_name text;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select title into v_title from public.tasks where id = new.task_id;
  if v_title is null then
    return new;
  end if;
  select display_name into v_name from public.profiles where id = new.reviewed_by;

  perform private.enqueue_push(
    new.submitted_by,
    'confirmed',
    new.id::text,
    coalesce(v_name, 'your partner') || ' confirmed your goal',
    '“' || v_title || '” counts for today',
    jsonb_build_object('kind', 'confirmed', 'completionId', new.id)
  );
  return new;
end;
$$;

revoke execute on function private.push_on_confirmation() from public;

create trigger task_completions_push_on_confirmation
  after update of status on public.task_completions
  for each row execute function private.push_on_confirmation();

/**
 * A note arrives. The note itself is the body: it is 80 characters from the
 * one person this phone belongs to, and reading it on the lock screen is the
 * whole point of sending one.
 */
create or replace function private.push_on_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner constant uuid := private.partner_of(new.sender_id);
  v_name text;
begin
  if v_partner is null or new.dismissed_at is not null then
    return new;
  end if;

  select display_name into v_name from public.profiles where id = new.sender_id;

  perform private.enqueue_push(
    v_partner,
    'note',
    new.id::text,
    coalesce(v_name, 'your partner') || ' sent you a note',
    new.text,
    jsonb_build_object('kind', 'note', 'noteId', new.id)
  );
  return new;
end;
$$;

revoke execute on function private.push_on_note() from public;

create trigger love_notes_push_on_note
  after insert on public.love_notes
  for each row execute function private.push_on_note();

-- ================================================================== reminders

/**
 * Queues "you still have goals left today" for everyone whose own clock has
 * just reached their reminder hour. Called by the push function on a
 * schedule; safe to call as often as you like, because the local date is the
 * dedupe key, so nobody gets a second one the same day.
 *
 * Only goals in the person's active couple count, and only ones with nothing
 * submitted for today: a proof waiting to be confirmed is done as far as the
 * person who did it is concerned.
 */
create or replace function public.enqueue_streak_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer := 0;
  v_person record;
  v_local timestamp;
  v_left integer;
begin
  for v_person in
    select p.id, p.timezone, p.reminder_hour, c.id as couple_id
    from public.profiles p
    join public.couples c
      on c.ended_at is null and p.id in (c.user1_id, c.user2_id)
    where p.notify_streak
      and exists (select 1 from private.push_devices d where d.user_id = p.id)
  loop
    v_local := private.local_now(v_person.timezone);
    if extract(hour from v_local)::integer <> v_person.reminder_hour then
      continue;
    end if;

    select count(*)
      into v_left
    from public.tasks t
    where t.assigned_to = v_person.id
      and t.couple_id = v_person.couple_id
      and t.archived_at is null
      and t.scheduled_weekdays @> array[extract(dow from v_local)::smallint]
      and not exists (
        select 1
        from public.task_completions tc
        where tc.task_id = t.id
          and tc.scheduled_date = v_local::date
      );
    if v_left = 0 then
      continue;
    end if;

    if private.enqueue_push(
         v_person.id,
         'reminder',
         v_local::date::text,
         'keep the streak going',
         case
           when v_left = 1 then 'one goal left today — you’ve got this'
           else v_left || ' goals left today — you’ve got this'
         end,
         jsonb_build_object('kind', 'reminder')
       )
    then
      v_queued := v_queued + 1;
    end if;
  end loop;

  return v_queued;
end;
$$;

revoke execute on function public.enqueue_streak_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_streak_reminders() to service_role;

-- ===================================================================== sending
--
-- The three calls the push function makes. They live in public because that is
-- the only schema the API exposes, and they are granted to the service role
-- alone — the same arrangement as account_photo_paths() and account_exists().

/**
 * Takes the next notifications to send, stamps an attempt on each, and
 * returns them with the recipient's tokens. Claiming with SKIP LOCKED means
 * two drains running at once cannot pick up the same row.
 *
 * A notification that has failed five times, or sat for a day, is left
 * behind: by then it is about something that has moved on.
 */
create or replace function public.claim_push_batch(p_limit integer default 50)
returns table (id bigint, kind text, title text, body text, payload jsonb, tokens text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select o.id
    from private.push_outbox o
    where o.sent_at is null
      and o.attempts < 5
      and o.queued_at > now() - interval '1 day'
    order by o.id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  ),
  claimed as (
    update private.push_outbox o
    set attempts = o.attempts + 1
    where o.id in (select due.id from due)
    returning o.id, o.kind, o.title, o.body, o.payload, o.recipient_id
  )
  select c.id,
         c.kind,
         c.title,
         c.body,
         c.payload,
         coalesce(array_agg(d.token order by d.token) filter (where d.token is not null), '{}'::text[])
  from claimed c
  left join private.push_devices d on d.user_id = c.recipient_id
  group by c.id, c.kind, c.title, c.body, c.payload
  order by c.id;
end;
$$;

revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

/**
 * Records what became of a claimed batch. Tokens Expo says no longer belong
 * to a device are deleted here, which is the only way a stale token ever
 * leaves the table.
 */
create or replace function public.finish_push(
  p_sent bigint[] default '{}'::bigint[],
  p_failed bigint[] default '{}'::bigint[],
  p_error text default null,
  p_dead_tokens text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.push_outbox
  set sent_at = now(), last_error = null
  where id = any (coalesce(p_sent, '{}'::bigint[]))
    and sent_at is null;

  update private.push_outbox
  set last_error = left(coalesce(p_error, 'unknown'), 200)
  where id = any (coalesce(p_failed, '{}'::bigint[]))
    and sent_at is null;

  delete from private.push_devices
  where token = any (coalesce(p_dead_tokens, '{}'::text[]));
end;
$$;

revoke execute on function public.finish_push(bigint[], bigint[], text, text[]) from public, anon, authenticated;
grant execute on function public.finish_push(bigint[], bigint[], text, text[]) to service_role;

/** Clears out the queue: sent notifications after three days, given-up ones after one. */
create or replace function public.prune_push_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  delete from private.push_outbox
  where (sent_at is not null and sent_at <= now() - interval '3 days')
     or (sent_at is null and queued_at <= now() - interval '1 day');
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function public.prune_push_outbox() from public, anon, authenticated;
grant execute on function public.prune_push_outbox() to service_role;

-- =================================================================== the phone

/**
 * What the app calls once iOS has said yes. One phone keeps one row: signing
 * in as someone else moves the token to them, so the person who just left
 * stops getting notifications on a phone that is no longer theirs.
 */
create or replace function public.register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  if p_token is null or not (char_length(p_token) between 10 and 200) then
    raise exception 'invalid token';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid platform';
  end if;
  -- a profile row is the trigger's job; without one there is nobody to notify
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'no profile';
  end if;

  insert into private.push_devices (token, user_id, platform)
  values (p_token, v_me, p_platform)
  on conflict (token) do update
  set user_id = v_me,
      platform = excluded.platform,
      seen_at = now();
end;
$$;

revoke execute on function public.register_push_device(text, text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;

/** What the app calls on the way out, so a logged-out phone goes quiet. */
create or replace function public.forget_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me constant uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  delete from private.push_devices
  where token = p_token
    and user_id = v_me;
end;
$$;

revoke execute on function public.forget_push_device(text) from public, anon;
grant execute on function public.forget_push_device(text) to authenticated;
