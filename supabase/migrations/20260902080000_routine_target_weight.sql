-- Optional target load on a routine exercise.
--
-- The first schema left load out deliberately: it is the one number that
-- belongs to the person rather than to the plan, and the session already
-- prefills it from the last time you did the movement.
--
-- That reasoning holds for a shared routine and not for a personal one. A
-- routine written for yourself often does carry the weight — "squat 4 × 8 at
-- 80" is one plan, not a plan plus a memory — so the column exists and is
-- nullable, exactly like target_sets and target_reps. Leave it empty and the
-- session still prefills from history; fill it in and it is the starting point.
--
-- numeric, not integer: 2.5 kg plates and 42.5 kg working sets are ordinary.

alter table public.routine_exercises
  add column target_weight numeric check (target_weight > 0);
