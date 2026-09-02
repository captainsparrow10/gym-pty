-- The global leaderboard.
--
-- This has to answer "who trains the most" without ever handing out a row
-- from sessions, logged_exercises or sets — that would mean anyone could read
-- anyone else's training log, which is exactly what the per-user RLS above
-- exists to prevent. A security definer function that returns only aggregates
-- is the way through: it runs with the privileges of whoever owns it, so it
-- can read every user's rows internally, but the return type is five
-- aggregate columns and nothing else ever reaches the caller.
--
-- `search_path = ''` plus fully qualified table names close the usual
-- security definer hole, where a caller with schema-creation rights could
-- otherwise shadow an unqualified table name and run arbitrary SQL with this
-- function's privileges.

create or replace function public.leaderboard(p_days integer default null)
returns table (
  user_id     uuid,
  display_name text,
  avatar_icon  text,
  avatar_color text,
  sessions     bigint,
  sets         bigint,
  volume_kg    numeric
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
    -- Warm-ups are excluded everywhere else in the app (rankings, records,
    -- volume charts); the leaderboard would be a lie about who trains hardest
    -- if it counted them here and nowhere else does.
    count(st.id) filter (where st.warmup = false) as sets,
    coalesce(sum(st.reps * st.weight_kg) filter (where st.warmup = false), 0) as volume_kg
  from public.profiles p
  left join public.sessions s
    on s.user_id = p.id
    and s.finished_at is not null
    and (p_days is null or s.date >= current_date - p_days)
  left join public.logged_exercises le on le.session_id = s.id
  left join public.sets st on st.logged_exercise_id = le.id
  where p.public_profile = true
  group by p.id, p.display_name, p.avatar_icon, p.avatar_color
  order by volume_kg desc, sessions desc;
$$;

comment on function public.leaderboard(integer) is
  'Aggregates only. Never select this function''s underlying tables directly for another user — that is what RLS blocks; this function is the one sanctioned way around it, and only in the aggregate direction.';

-- Postgres grants EXECUTE to PUBLIC by default, which through PostgREST means
-- the anon role — anyone unauthenticated. Revoke that first so the grant to
-- authenticated below is the only path in.
revoke all on function public.leaderboard(integer) from public;
grant execute on function public.leaderboard(integer) to authenticated;
