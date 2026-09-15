-- Fix user-facing foreign keys to cascade on delete, and wipe test data.
-- Run in the Supabase SQL Editor after 0002_design_renovation.sql.
--
-- WARNING: section 1 wipes ALL app data (goals, photos records, couples,
-- invites, notes). Only run this before real use of the app.

-- =========================================================================
-- 1. Wipe test data so the new constraints validate on clean tables
-- =========================================================================

truncate task_completions, tasks, couple_invites, couples, love_notes;

-- =========================================================================
-- 2. Rebuild FKs so deleting a user (or couple) removes their data
--    instead of erroring
-- =========================================================================

alter table tasks drop constraint if exists tasks_assigned_to_fkey;
alter table tasks add constraint tasks_assigned_to_fkey
  foreign key (assigned_to) references profiles(id) on delete cascade;

alter table tasks drop constraint if exists tasks_couple_id_fkey;
alter table tasks add constraint tasks_couple_id_fkey
  foreign key (couple_id) references couples(id) on delete cascade;

alter table task_completions drop constraint if exists task_completions_submitted_by_fkey;
alter table task_completions add constraint task_completions_submitted_by_fkey
  foreign key (submitted_by) references profiles(id) on delete cascade;

alter table task_completions drop constraint if exists task_completions_reviewed_by_fkey;
alter table task_completions add constraint task_completions_reviewed_by_fkey
  foreign key (reviewed_by) references profiles(id) on delete set null;

alter table couples drop constraint if exists couples_user1_id_fkey;
alter table couples add constraint couples_user1_id_fkey
  foreign key (user1_id) references profiles(id) on delete cascade;

alter table couples drop constraint if exists couples_user2_id_fkey;
alter table couples add constraint couples_user2_id_fkey
  foreign key (user2_id) references profiles(id) on delete cascade;

alter table couple_invites drop constraint if exists couple_invites_created_by_fkey;
alter table couple_invites add constraint couple_invites_created_by_fkey
  foreign key (created_by) references profiles(id) on delete cascade;

-- =========================================================================
-- 3. Remove the test users
-- =========================================================================

delete from auth.users where email like '%powercouple.test@gmail.com';

-- Note: test photos can't be deleted via SQL (Supabase blocks direct
-- storage.objects deletes). Remove them in Dashboard > Storage >
-- completion-photos instead.
