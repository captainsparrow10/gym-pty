-- Closes a real hole in the previous migration: Supabase's default privileges
-- on this project grant EXECUTE on every new function to `anon` directly,
-- not through the PUBLIC pseudo-role. `revoke all ... from public` only
-- revokes the implicit PUBLIC grant every function gets by default — it does
-- nothing to a grant `anon` already holds in its own right, so the previous
-- migration left the leaderboard callable without signing in at all.

revoke execute on function public.leaderboard(integer) from anon;
