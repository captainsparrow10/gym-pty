-- Profile identity, routine visibility, and the RLS split that makes public
-- reads possible without loosening anything else.
--
-- Avatars are a closed set rather than an upload: no storage bucket, no
-- external image service, nothing that has to be moderated. The check
-- constraints are the enforcement, not just documentation — a row with an
-- icon or colour outside the set is rejected at the database, not only
-- filtered out in the UI.

alter table public.profiles
  add column avatar_icon text not null default 'dumbbell'
    check (avatar_icon in (
      'dumbbell', 'flame', 'zap', 'trophy', 'star', 'target', 'anchor', 'rocket'
    )),
  add column avatar_color text not null default 'orange'
    check (avatar_color in (
      'red', 'orange', 'yellow', 'green', 'blue', 'purple'
    ));

-- Opt-out of the leaderboard and of being findable at all. Defaults to true so
-- the leaderboard has anyone in it on day one; a user who wants to disappear
-- flips it off rather than the feature requiring an opt-in nobody reaches.
alter table public.profiles
  add column public_profile boolean not null default true;

comment on column public.profiles.public_profile is
  'Governs two things: whether this profile is visible to other users at all, and whether it is counted in the leaderboard.';

alter table public.routines
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public'));

-- ---------------------------------------------------------------------------
-- RLS: split each "own X" for-all policy into a public-or-own read and an
-- owner-only write, wherever a row can now be public.
-- ---------------------------------------------------------------------------
--
-- profiles: a row is readable once its owner has opted in via public_profile,
-- or by the owner regardless. This is what lets a public routine's card show
-- who made it, and is a different question from the leaderboard, which is a
-- security definer function and never depends on this policy.

drop policy "own profile" on public.profiles;

create policy "read public or own profile" on public.profiles
  for select using (public_profile = true or id = (select auth.uid()));

create policy "insert own profile" on public.profiles
  for insert with check (id = (select auth.uid()));

create policy "update own profile" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "delete own profile" on public.profiles
  for delete using (id = (select auth.uid()));

-- routines: same split, gated on the new visibility column instead.

drop policy "own routines" on public.routines;

create policy "read public or own routines" on public.routines
  for select using (visibility = 'public' or user_id = (select auth.uid()));

create policy "insert own routines" on public.routines
  for insert with check (user_id = (select auth.uid()));

create policy "update own routines" on public.routines
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "delete own routines" on public.routines
  for delete using (user_id = (select auth.uid()));

-- routine_exercises: no visibility column of its own — ownership and
-- visibility are both proved by joining up to the parent routine, same as
-- before. A public routine's exercise list has to be readable for the browse
-- screen to be more than a name; writes stay owner-only regardless of
-- visibility, so making a routine public never grants anyone the ability to
-- edit it.

drop policy "own routine exercises" on public.routine_exercises;

create policy "read public or own routine exercises" on public.routine_exercises
  for select using (
    exists (
      select 1 from public.routines r
      where r.id = routine_id
        and (r.visibility = 'public' or r.user_id = (select auth.uid()))
    )
  );

create policy "insert own routine exercises" on public.routine_exercises
  for insert with check (
    exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );

create policy "update own routine exercises" on public.routine_exercises
  for update using (
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

create policy "delete own routine exercises" on public.routine_exercises
  for delete using (
    exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );
