-- An index behind every foreign key (Supabase performance advisor 0001).
--
-- Without one, deleting a profile or a couple scans each referencing table in
-- full to find the rows to cascade to, and the lookups every screen and
-- policy makes by couple, goal or person scan too. Already covered, so left
-- out: couples.user1_id (leads the user1_id, user2_id unique key),
-- day_schedules.user_id (leads the primary key) and task_completions.task_id
-- (leads the task_id, scheduled_date unique key).

create index couple_invites_created_by_idx on public.couple_invites (created_by);
create index couples_user2_id_idx on public.couples (user2_id);
create index love_notes_couple_id_idx on public.love_notes (couple_id);
create index love_notes_sender_id_idx on public.love_notes (sender_id);
create index task_completions_submitted_by_idx on public.task_completions (submitted_by);
create index task_completions_reviewed_by_idx on public.task_completions (reviewed_by);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
create index tasks_couple_id_idx on public.tasks (couple_id);
