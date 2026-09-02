-- Exercises planned for one specific date, with no routine behind them.
--
-- A routine is a template: you name it, you rate it, you repeat it, and its
-- history is the point. Sometimes you just decide that Thursday is deadlifts
-- and rows, once, and there is nothing to name and nothing to reuse.
--
-- Modelling that as a routine was the obvious shortcut and is wrong in a way
-- that gets worse over time: every one-off would land in the routine list, the
-- ratings and the "last performed / average volume" stats assume repetition
-- and would be meaningless on a single-use row, and a routine has no date, so
-- "what did I plan for Thursday" could not be asked at all.
--
-- So: its own table, keyed by a date rather than by a weekday. `routines`
-- answers "what does my week look like"; this answers "what am I doing on
-- Thursday", which is a different question and often has a different answer.
--
-- The two coexist deliberately. A day can have a scheduled routine, a handful
-- of planned exercises, both, or neither — neither being a rest day.

create table public.planned_exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  date          date not null,
  exercise_slug text not null,
  -- Ordering within the day. Gaps are allowed so a reorder can renumber
  -- lazily instead of rewriting every row, matching routine_exercises.
  position      integer not null default 0,
  -- The same optional targets a routine exercise carries, for the same reason:
  -- "squat 4 x 8 at 80" is one plan, not a plan plus a memory. All three stay
  -- nullable, so planning an exercise with no numbers at all is normal.
  target_sets   integer check (target_sets > 0),
  target_reps   integer check (target_reps > 0),
  target_weight numeric check (target_weight > 0),
  note          text,
  created_at    timestamptz not null default now(),
  -- The same movement twice in one day is far more often a double tap than an
  -- intention, and the add flow can report "already planned" instead of
  -- silently making a second row.
  unique (user_id, date, exercise_slug)
);

create index planned_exercises_user_date_idx
  on public.planned_exercises (user_id, date, position);

alter table public.planned_exercises enable row level security;

-- Owner-only, in both directions. A day plan is not shareable the way a
-- routine is: `routines` has a visibility column precisely because publishing
-- was a deliberate feature there, and nothing here asked for it.
create policy planned_exercises_owner on public.planned_exercises
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
