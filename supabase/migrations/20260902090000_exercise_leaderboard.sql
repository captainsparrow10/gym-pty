-- The leaderboard for one exercise.
--
-- `leaderboard()` answers "who trains the most". This answers a narrower and
-- more useful question — "how does everyone else do THIS movement" — which the
-- global one cannot, because summing every exercise into one volume number
-- says nothing about whether your bench press is heavy.
--
-- Same construction and the same reason: a caller must never be able to read
-- another user's sessions, logged_exercises or sets, which is exactly what the
-- per-user RLS blocks. `security definer` runs with the owner's privileges so
-- the aggregation can see every row internally, while the return type is six
-- aggregate columns and nothing else ever leaves the function. There is no
-- path from a returned row back to an individual set.
--
-- `search_path = ''` with fully qualified names closes the usual security
-- definer hole, where a caller able to create a schema could shadow an
-- unqualified table name and run arbitrary SQL with this function's rights.

create or replace function public.exercise_leaderboard(
  p_slug text,
  p_days integer default null
)
returns table (
  user_id        uuid,
  display_name   text,
  avatar_icon    text,
  avatar_color   text,
  sessions       bigint,
  sets           bigint,
  volume_kg      numeric,
  top_weight_kg  numeric,
  best_one_rm_kg numeric,
  last_performed date
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    p.id as user_id,
    p.display_name,
    p.avatar_icon,
    p.avatar_color,
    count(distinct s.id) as sessions,
    count(st.id) as sets,
    coalesce(sum(st.reps * st.weight_kg), 0) as volume_kg,
    coalesce(max(st.weight_kg), 0) as top_weight_kg,
    -- Epley, matching `estimatedOneRepMax` in packages/shared/src/domain:
    -- w x (1 + reps / 30), except that a single rep is the true max and is
    -- returned as the load itself rather than run through the estimate.
    -- Two people who lift the same weight for different reps are not
    -- comparable on load alone, which is the whole point of ranking on this.
    coalesce(max(
      case
        when st.reps = 1 then st.weight_kg
        else st.weight_kg * (1 + st.reps / 30.0)
      end
    ), 0) as best_one_rm_kg,
    max(s.date) as last_performed
  from public.profiles p
  join public.sessions s
    on s.user_id = p.id
    and s.finished_at is not null
    and (p_days is null or s.date >= current_date - p_days)
  join public.logged_exercises le
    on le.session_id = s.id
    and le.exercise_slug = p_slug
  -- Warm-ups are excluded everywhere else in the app — rankings, personal
  -- records, volume charts — so counting them here would rank people partly
  -- on how much they warm up.
  join public.sets st
    on st.logged_exercise_id = le.id
    and st.warmup = false
  where p.public_profile = true
  group by p.id, p.display_name, p.avatar_icon, p.avatar_color
  -- Inner joins throughout: someone who has never done this exercise has no
  -- place on its board, unlike the global leaderboard where a zero row is a
  -- meaningful "signed up, has not trained".
  order by best_one_rm_kg desc, volume_kg desc;
$$;

comment on function public.exercise_leaderboard(text, integer) is
  'Aggregates only, for one exercise slug. Never select this function''s underlying tables directly for another user — that is what RLS blocks; this and leaderboard() are the sanctioned ways around it, and only in the aggregate direction.';

-- Postgres grants EXECUTE to PUBLIC by default, which through PostgREST means
-- the anon role — anyone unauthenticated. Revoke first so the grant below is
-- the only way in.
revoke all on function public.exercise_leaderboard(text, integer) from public;
grant execute on function public.exercise_leaderboard(text, integer) to authenticated;
