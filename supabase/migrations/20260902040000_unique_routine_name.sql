-- One routine per name, per user.
--
-- Routines already have a UUID, which makes them unique to the database. It
-- does not make them distinguishable to a person: two routines both called
-- "Push" are one bug away from being logged against the wrong one, and the
-- rankings that hang off routine_id then mix two different sessions together.
--
-- Case-insensitive and whitespace-insensitive, because "push" and "Push " are
-- the same routine to whoever typed them.

create unique index routines_unique_name_per_user
  on public.routines (user_id, lower(trim(name)));
