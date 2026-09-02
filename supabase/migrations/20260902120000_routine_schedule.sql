-- Which weekdays a routine is planned for.
--
-- Without this the app can show what you have done and not what you are meant
-- to do today, which is the question you actually open it with. A rest day is
-- then a real answer rather than an absence: no routine names today, so today
-- is off.
--
-- An array on the routine rather than a `routine_days` table. The relation is
-- tiny and fixed — at most seven values from a closed set — nothing else will
-- ever join to it, and the whole schedule has to be read at once anyway. A
-- side table would add a join to every routine read to model a column.
--
-- 0 is Monday through 6 for Sunday, matching `weekStart` and the weekly volume
-- chart, which are Monday-first. Postgres `extract(dow)` and JavaScript
-- `getDay()` are both Sunday-first, so anything crossing that boundary
-- converts explicitly; storing the app's own convention keeps the conversion
-- in one place instead of leaving two plausible readings in the column.

alter table public.routines
  add column weekdays smallint[] not null default '{}';

-- A check constraint cannot contain a subquery, and counting distinct
-- elements of an array needs one. Wrapping it in an immutable function is the
-- sanctioned way through: the planner can inline it and the constraint stays a
-- plain boolean expression.
create or replace function public.distinct_count(arr smallint[])
returns integer
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select count(distinct d)::integer from pg_catalog.unnest(arr) as d;
$$;

alter table public.routines
  add constraint routines_weekdays_valid check (
    -- No duplicates, and nothing outside Monday..Sunday. A routine on
    -- "Tuesday, Tuesday" is a bug in whatever wrote it, not a preference.
    array_length(weekdays, 1) is null
    or (
      array_length(weekdays, 1) <= 7
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
      and array_length(weekdays, 1) = public.distinct_count(weekdays)
    )
  );

comment on column public.routines.weekdays is
  'Planned weekdays, 0 = Monday .. 6 = Sunday. Empty means unscheduled, which is different from a rest day: an unscheduled routine is simply not part of the week.';
