-- How long to rest, remembered where the plan lives.
--
-- `profiles.rest_seconds` has existed since the first schema and was never
-- read once: the session used a hardcoded 90. That is the wrong number for
-- most of a workout in both directions — a set of twenty curls does not need
-- ninety seconds, and a heavy triple needs three minutes — so the countdown
-- was something to dismiss rather than something to follow.
--
-- Rest belongs to the exercise inside a plan, not to the person. Ninety
-- seconds is a reasonable default for you, but it is not a property of you the
-- way your name is; it is a property of what you are about to do next. So the
-- column goes on the exercise in a routine and on the exercise planned for a
-- day, and `profiles.rest_seconds` becomes the fallback it should always have
-- been rather than the only answer.
--
-- Nullable, like the other targets beside it. Empty means "use the default",
-- which is different from zero — zero is a superset with no rest at all, and a
-- plan is allowed to say that.

alter table public.routine_exercises
  add column rest_seconds integer check (rest_seconds between 0 and 900);

alter table public.planned_exercises
  add column rest_seconds integer check (rest_seconds between 0 and 900);

comment on column public.routine_exercises.rest_seconds is
  'Rest after a set of this exercise. Null falls back to profiles.rest_seconds. Zero means no rest, which is a deliberate plan and not the same as null.';
