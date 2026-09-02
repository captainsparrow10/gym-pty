-- Marks when a session was closed.
--
-- The live session screen has to survive a reload, so "which session is in
-- progress" must be answerable from the database rather than from client state.
-- Inferring it from `duration_sec = 0` would be implicit and would break the
-- moment someone logs a session and closes it in under a second.
--
-- Null means in progress. A partial unique index enforces at most one open
-- session per user, so a second device cannot silently start a parallel one.

alter table public.sessions
  add column finished_at timestamptz;

create unique index sessions_one_open_per_user
  on public.sessions (user_id)
  where finished_at is null;

comment on column public.sessions.finished_at is
  'Null while the session is in progress. Set when the user finishes it.';
