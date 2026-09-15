-- Every table gets a primary key (Supabase performance advisor 0004).
--
-- private.invite_misses shipped without one. Nothing looks rows up by it, but
-- a table without a key cannot be replicated or have single rows fixed by
-- hand, and invariants.test.ts now holds every table to this.

alter table private.invite_misses
  add column id bigint generated always as identity primary key;
