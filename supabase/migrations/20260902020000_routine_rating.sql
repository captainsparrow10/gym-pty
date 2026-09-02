-- Routine rating, and making the routine-to-session link usable.
--
-- `sessions.routine_id` already existed but nothing wrote it, so a routine had
-- no history: you could not see how many times you had run it or whether the
-- volume was going anywhere. Sessions started from a routine now record it.

alter table public.routines
  add column rating smallint check (rating between 1 and 5);

comment on column public.routines.rating is
  'Optional 1-5 self-rating. Null means unrated, which is different from a bad rating.';

-- Every "how has this routine been going" query filters on it.
create index sessions_routine_idx on public.sessions (routine_id, date desc)
  where routine_id is not null;
