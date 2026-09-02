-- Body measurements over time.
--
-- `bodyweight` already tracks the scale, and the scale is the one number that
-- moves for reasons that have nothing to do with training — water, salt, the
-- time of day. A waist that drops two centimetres while the scale does not
-- move is the answer to "is this working", and until now the app could not
-- record it.
--
-- Columns rather than a (name, value) table. The set of measurements a person
-- takes is closed and small, every one is a length in centimetres, and a key
-- table would trade a typed column for a string that can be misspelled into a
-- second series that silently never joins the first. Adding a measurement
-- later is one migration, which is the right cost for something that changes
-- about once a year.
--
-- All nullable: nobody measures everything, and a row with only a waist is a
-- perfectly good row. The scale stays in `bodyweight` — it is logged far more
-- often than a tape measure comes out, and merging them would either force a
-- weigh-in to carry fourteen empty columns or make the weight series sparse.

create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null default current_date,

  -- Percent, not a length, and the only one here that is an estimate rather
  -- than a measurement — calipers and scales disagree by several points, so
  -- it is worth tracking as a trend and not as a fact.
  body_fat_pct numeric(4, 1) check (body_fat_pct between 1 and 70),

  neck_cm      numeric(5, 1) check (neck_cm     between 10 and 100),
  shoulders_cm numeric(5, 1) check (shoulders_cm between 50 and 250),
  chest_cm     numeric(5, 1) check (chest_cm    between 40 and 250),
  waist_cm     numeric(5, 1) check (waist_cm    between 30 and 250),
  hips_cm      numeric(5, 1) check (hips_cm     between 40 and 250),

  -- Left and right kept apart. Averaging them hides the asymmetry that is
  -- often the reason someone starts measuring in the first place.
  left_arm_cm    numeric(5, 1) check (left_arm_cm    between 10 and 100),
  right_arm_cm   numeric(5, 1) check (right_arm_cm   between 10 and 100),
  left_forearm_cm  numeric(5, 1) check (left_forearm_cm  between 10 and 80),
  right_forearm_cm numeric(5, 1) check (right_forearm_cm between 10 and 80),
  left_thigh_cm  numeric(5, 1) check (left_thigh_cm  between 20 and 120),
  right_thigh_cm numeric(5, 1) check (right_thigh_cm between 20 and 120),
  left_calf_cm   numeric(5, 1) check (left_calf_cm   between 15 and 80),
  right_calf_cm  numeric(5, 1) check (right_calf_cm  between 15 and 80),

  note        text,
  created_at  timestamptz not null default now(),

  -- One set of measurements per day, replaced rather than appended, matching
  -- how `bodyweight` already behaves.
  unique (user_id, date)
);

create index body_measurements_user_date_idx
  on public.body_measurements (user_id, date desc);

alter table public.body_measurements enable row level security;

-- Owner-only in both directions. Nothing about this is shareable: the
-- leaderboard deals in training volume, and a waist measurement is not that.
create policy body_measurements_owner on public.body_measurements
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
