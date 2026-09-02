-- Rank bodyweight and timed work by what they actually measure.
--
-- The first version of this board ranked everyone on estimated 1RM, which is
-- the right call for a barbell and meaningless for a pull-up: unweighted work
-- is stored at zero kilograms, so every lifter came back with a 1RM of 0 and a
-- top set of 0, and the ordering fell through to a tiebreak on a volume that
-- was also 0. Whoever happened to sort first led the board. Someone who trains
-- mostly calisthenics was ranked first on a pull-up board by accident.
--
-- Weight is not the only thing a set records. Reps carry bodyweight work and
-- seconds carry a plank, so both are returned and the ordering falls through
-- to them in turn. An exercise nobody loads is ranked on total reps; one with
-- no reps at all, like a plank, on its longest hold.
--
-- Ordering stays in SQL rather than moving to the client so that paging and
-- any future limit cut the board in the same order the caller sees.

-- Dropped rather than replaced: `create or replace function` cannot change a
-- function's OUT parameters, and this adds three columns to the return type.
drop function if exists public.exercise_leaderboard(text, integer);

create function public.exercise_leaderboard(
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
  reps           bigint,
  volume_kg      numeric,
  top_weight_kg  numeric,
  best_one_rm_kg numeric,
  top_seconds    integer,
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
    coalesce(sum(st.reps), 0) as reps,
    coalesce(sum(st.reps * st.weight_kg), 0) as volume_kg,
    coalesce(max(st.weight_kg), 0) as top_weight_kg,
    -- Epley, matching `estimatedOneRepMax` in packages/shared/src/domain:
    -- w x (1 + reps / 30), except that a single rep is the true max and is
    -- returned as the load itself rather than run through the estimate.
    coalesce(max(
      case
        when st.reps = 1 then st.weight_kg
        else st.weight_kg * (1 + st.reps / 30.0)
      end
    ), 0) as best_one_rm_kg,
    coalesce(max(st.seconds), 0) as top_seconds,
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
  -- Each term only decides anything when the ones before it are tied at zero,
  -- which is exactly the case where the earlier metric does not apply to this
  -- exercise: no load, then no reps.
  order by best_one_rm_kg desc, volume_kg desc, reps desc, top_seconds desc;
$$;

comment on function public.exercise_leaderboard(text, integer) is
  'Aggregates only, for one exercise slug. Ranks on estimated 1RM, falling through to volume, reps and hold time so bodyweight and timed work are ranked on something they actually record. Never select this function''s underlying tables directly for another user.';

revoke all on function public.exercise_leaderboard(text, integer) from public;
grant execute on function public.exercise_leaderboard(text, integer) to authenticated;
