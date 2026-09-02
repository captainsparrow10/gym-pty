-- Training log schema.
--
-- Exercises are identified by their catalogue slug as plain text, with no
-- foreign key. The catalogue is static reference data that ships with the
-- application bundle and is versioned with the code, so mirroring 302 rows into
-- Postgres would only add a round trip to render a list the client already
-- holds.
--
-- Every table is owned by exactly one user and protected by row level security.

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Loads are stored in kilograms everywhere; this only affects presentation.
  unit        text not null default 'kg' check (unit in ('kg', 'lb')),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 900),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------

create table public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references public.routines (id) on delete cascade,
  exercise_slug text not null,
  -- Ordering within the routine. Gaps are allowed so a reorder can renumber
  -- lazily instead of rewriting every row.
  position      integer not null,
  target_sets   integer check (target_sets > 0),
  target_reps   integer check (target_reps > 0),
  unique (routine_id, position)
);

create index routine_exercises_routine_idx on public.routine_exercises (routine_id, position);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  routine_id   uuid references public.routines (id) on delete set null,
  -- Local calendar date of the workout, distinct from started_at: a session
  -- that runs past midnight still belongs to the day it started.
  date         date not null default current_date,
  started_at   timestamptz not null default now(),
  duration_sec integer not null default 0 check (duration_sec >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create index sessions_user_date_idx on public.sessions (user_id, date desc);

create table public.logged_exercises (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  exercise_slug text not null,
  position      integer not null,
  unique (session_id, position)
);

create index logged_exercises_session_idx on public.logged_exercises (session_id, position);
-- Progress charts read every set for one exercise across all history, so the
-- slug is the hot lookup path.
create index logged_exercises_slug_idx on public.logged_exercises (exercise_slug);

create table public.sets (
  id                  uuid primary key default gen_random_uuid(),
  logged_exercise_id  uuid not null references public.logged_exercises (id) on delete cascade,
  position            integer not null,
  reps                integer not null default 0 check (reps >= 0),
  -- Always kilograms. Zero for unweighted bodyweight work.
  weight_kg           numeric(6, 2) not null default 0 check (weight_kg >= 0),
  -- Planks, hangs and other timed work.
  seconds             integer check (seconds >= 0),
  -- Warm-ups are excluded from personal records and volume trends.
  warmup              boolean not null default false,
  completed_at        timestamptz not null default now(),
  unique (logged_exercise_id, position)
);

create index sets_exercise_idx on public.sets (logged_exercise_id, position);

-- ---------------------------------------------------------------------------
-- Measurements and notes
-- ---------------------------------------------------------------------------

create table public.bodyweight (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null default current_date,
  weight_kg  numeric(5, 2) not null check (weight_kg > 0),
  -- One reading per day; logging again replaces it.
  unique (user_id, date)
);

create index bodyweight_user_date_idx on public.bodyweight (user_id, date desc);

-- Free-text notes per exercise. The coach reads these for context, which is
-- how "my shoulder hurts on bench" reaches the model without being retyped.
create table public.exercise_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  exercise_slug text not null,
  body          text not null check (length(trim(body)) > 0),
  created_at    timestamptz not null default now()
);

create index exercise_notes_user_slug_idx on public.exercise_notes (user_id, exercise_slug, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Tables that hang off a parent (routine_exercises, logged_exercises, sets)
-- have no user_id of their own; ownership is proved by joining up to the row
-- that does. Denormalising user_id onto them would be faster to check but
-- creates a second copy of the truth that can drift.

alter table public.profiles          enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.sessions          enable row level security;
alter table public.logged_exercises  enable row level security;
alter table public.sets              enable row level security;
alter table public.bodyweight        enable row level security;
alter table public.exercise_notes    enable row level security;

create policy "own profile" on public.profiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own routines" on public.routines
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own sessions" on public.sessions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own bodyweight" on public.bodyweight
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own exercise notes" on public.exercise_notes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own routine exercises" on public.routine_exercises
  for all using (
    exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );

create policy "own logged exercises" on public.logged_exercises
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "own sets" on public.sets
  for all using (
    exists (
      select 1
      from public.logged_exercises le
      join public.sessions s on s.id = le.session_id
      where le.id = logged_exercise_id and s.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1
      from public.logged_exercises le
      join public.sessions s on s.id = le.session_id
      where le.id = logged_exercise_id and s.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger routines_touch before update on public.routines
  for each row execute function public.touch_updated_at();

-- A profile row on sign-up, so the app never has to handle its absence.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
