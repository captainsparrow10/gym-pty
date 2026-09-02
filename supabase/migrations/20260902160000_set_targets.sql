-- Per-set targets, so a plan can say a pyramid.
--
-- A routine exercise carried one target_sets / target_reps / target_weight,
-- which can only express "4 x 8 at 80 — every set the same". Most serious
-- programming is not that: ramping sets, a top set with back-offs, drop sets,
-- and "8 x 60, 6 x 70, 4 x 80" all need the sets to differ. Logging already
-- handled it — every row in `sets` carries its own reps and load — so the plan
-- was the only place that could not say what you were about to do.
--
-- One table for both parents rather than two nearly identical ones. A routine
-- exercise and an exercise planned for a date want exactly the same thing, and
-- two tables would mean two of every query, mutation and editor, drifting
-- apart the first time one of them is fixed. The check constraint enforces
-- what the two nullable foreign keys cannot: exactly one parent, never both
-- and never neither.

create table public.set_targets (
  id                  uuid primary key default gen_random_uuid(),
  routine_exercise_id uuid references public.routine_exercises (id) on delete cascade,
  planned_exercise_id uuid references public.planned_exercises (id) on delete cascade,

  position            integer not null,
  reps                integer check (reps > 0),
  weight_kg           numeric check (weight_kg > 0),
  rest_seconds        integer check (rest_seconds between 0 and 900),
  -- A warm-up written into the plan. Logging already distinguishes them and
  -- excludes them from volume and records everywhere; a plan that says "two
  -- ramp-up sets then three working" should be able to say so too.
  warmup              boolean not null default false,

  constraint set_targets_one_parent check (
    (routine_exercise_id is not null) <> (planned_exercise_id is not null)
  ),

  -- Deferrable, like the other ordering constraints in this schema: a swap
  -- has to be able to park rows mid-transaction. The immediate version is what
  -- made reordering exercises collide on its first update and lose a row.
  constraint set_targets_routine_position
    unique (routine_exercise_id, position) deferrable initially deferred,
  constraint set_targets_planned_position
    unique (planned_exercise_id, position) deferrable initially deferred
);

create index set_targets_routine_idx
  on public.set_targets (routine_exercise_id, position);
create index set_targets_planned_idx
  on public.set_targets (planned_exercise_id, position);

alter table public.set_targets enable row level security;

-- Reachable only through a parent the caller owns. Two policies rather than
-- one with an OR, so each reads as the ownership rule of its own table.
create policy set_targets_owner on public.set_targets
  for all using (
    exists (
      select 1
      from public.routine_exercises re
      join public.routines r on r.id = re.routine_id
      where re.id = set_targets.routine_exercise_id
        and r.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.planned_exercises pe
      where pe.id = set_targets.planned_exercise_id
        and pe.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.routine_exercises re
      join public.routines r on r.id = re.routine_id
      where re.id = set_targets.routine_exercise_id
        and r.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.planned_exercises pe
      where pe.id = set_targets.planned_exercise_id
        and pe.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill
--
-- Every existing target becomes that many identical rows, so nothing a person
-- has already planned is lost and the new editor opens showing what they set.
-- `generate_series` over target_sets is what turns "4 x 8" into four rows.
-- ---------------------------------------------------------------------------

insert into public.set_targets
  (routine_exercise_id, position, reps, weight_kg, rest_seconds)
select
  re.id,
  gs.n - 1,
  re.target_reps,
  re.target_weight,
  re.rest_seconds
from public.routine_exercises re
cross join lateral generate_series(1, coalesce(re.target_sets, 0)) as gs(n)
where re.target_sets is not null;

insert into public.set_targets
  (planned_exercise_id, position, reps, weight_kg, rest_seconds)
select
  pe.id,
  gs.n - 1,
  pe.target_reps,
  pe.target_weight,
  pe.rest_seconds
from public.planned_exercises pe
cross join lateral generate_series(1, coalesce(pe.target_sets, 0)) as gs(n)
where pe.target_sets is not null;

-- The old columns are dropped rather than kept in sync. Two representations of
-- the same plan disagree the moment one of them is edited, and a stale
-- "4 x 8" beside a pyramid is worse than no shorthand at all. The count of
-- sets is now the count of rows.
alter table public.routine_exercises
  drop column target_sets,
  drop column target_reps,
  drop column target_weight,
  drop column rest_seconds;

alter table public.planned_exercises
  drop column target_sets,
  drop column target_reps,
  drop column target_weight,
  drop column rest_seconds;
