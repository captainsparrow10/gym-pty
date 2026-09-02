-- Atomic reordering.
--
-- Reordering used to be a loop from the client: park every row on a negative
-- position, then write the final ones. That is six or more round trips for a
-- single drag, during which the rows genuinely sit at negative positions — and
-- anything that refetches in that window (TanStack Query refetches on window
-- focus) reads a scrambled list. An interrupted run left them parked for good.
--
-- The unique constraints become DEFERRABLE so the whole reorder can happen in
-- one statement inside one transaction, with uniqueness checked at commit
-- rather than per row. No intermediate state is ever observable.

alter table public.logged_exercises
  drop constraint logged_exercises_session_id_position_key;

alter table public.logged_exercises
  add constraint logged_exercises_session_id_position_key
  unique (session_id, position) deferrable initially immediate;

alter table public.routine_exercises
  drop constraint routine_exercises_routine_id_position_key;

alter table public.routine_exercises
  add constraint routine_exercises_routine_id_position_key
  unique (routine_id, position) deferrable initially immediate;

-- Both functions take the ids in their new order and renumber them 0..n-1.
-- Row level security still applies: these are `security invoker`, so a caller
-- can only renumber rows they can already update.

create or replace function public.reorder_logged_exercises(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set constraints all deferred;

  update public.logged_exercises as le
  set position = ordered.new_position
  from (
    select id, (ordinality - 1)::int as new_position
    from unnest(p_ids) with ordinality as t(id, ordinality)
  ) as ordered
  where le.id = ordered.id;
end;
$$;

create or replace function public.reorder_routine_exercises(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set constraints all deferred;

  update public.routine_exercises as re
  set position = ordered.new_position
  from (
    select id, (ordinality - 1)::int as new_position
    from unnest(p_ids) with ordinality as t(id, ordinality)
  ) as ordered
  where re.id = ordered.id;
end;
$$;
