-- The leaderboard for a set of exercises.
--
-- `leaderboard()` ranks everything at once and `exercise_leaderboard()` ranks
-- one movement. Between them sits the question people actually ask: who
-- squats the most, who benches the most, who does the most on cables. That is
-- a category, and categories live in the catalogue rather than in Postgres.
--
-- The database stores `exercise_slug` and nothing else about an exercise. Its
-- muscle, its equipment and its type come from `packages/shared/catalog`, a
-- build artefact the client already has in memory. Copying that classification
-- into Postgres would give the app two of them, and the day the catalogue is
-- rebuilt they disagree — silently, since nothing joins them. So the caller
-- resolves a category to slugs and passes the list; the function only knows
-- how to aggregate over a set.
--
-- The array is bounded by the catalogue itself: 302 exercises, and the largest
-- single category is well under half of that.
--
-- Same construction as the other two: aggregates only, so no row from
-- sessions, logged_exercises or sets ever reaches the caller, and
-- `search_path = ''` closes the security definer hole.

create or replace function public.category_leaderboard(
  p_slugs text[],
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
  exercises      bigint,
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
    -- Epley, matching `estimatedOneRepMax` in packages/shared/src/domain.
    coalesce(max(
      case
        when st.reps = 1 then st.weight_kg
        else st.weight_kg * (1 + st.reps / 30.0)
      end
    ), 0) as best_one_rm_kg,
    -- How much of the category they actually train. Someone who benches and
    -- nothing else is not the same as someone who trains the whole of Chest,
    -- and volume alone cannot tell them apart.
    count(distinct le.exercise_slug) as exercises,
    max(s.date) as last_performed
  from public.profiles p
  join public.sessions s
    on s.user_id = p.id
    and s.finished_at is not null
    and (p_days is null or s.date >= current_date - p_days)
  join public.logged_exercises le
    on le.session_id = s.id
    and le.exercise_slug = any(p_slugs)
  -- Warm-ups are excluded everywhere else in the app, so counting them here
  -- would rank people partly on how much they warm up.
  join public.sets st
    on st.logged_exercise_id = le.id
    and st.warmup = false
  where p.public_profile = true
  group by p.id, p.display_name, p.avatar_icon, p.avatar_color
  -- Volume leads here, unlike the single-exercise board. A category is a body
  -- of work rather than one lift, and the heaviest single set in a category of
  -- thirty movements says less about it than the total does.
  order by volume_kg desc, reps desc, sessions desc;
$$;

comment on function public.category_leaderboard(text[], integer) is
  'Aggregates only, over a caller-supplied set of exercise slugs. The category-to-slug mapping lives in packages/shared/catalog, deliberately not duplicated here. Never select this function''s underlying tables directly for another user.';

revoke all on function public.category_leaderboard(text[], integer) from public;
grant execute on function public.category_leaderboard(text[], integer) to authenticated;
