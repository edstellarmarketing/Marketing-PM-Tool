-- Allow all authenticated users to read all profiles.
-- Previously only own profile was readable, causing names to not appear
-- in leaderboard award sections for other users.
DROP POLICY IF EXISTS "profiles_select_own" ON "Marketing-PM-Tool".profiles;

CREATE POLICY "profiles_select_authenticated" ON "Marketing-PM-Tool".profiles
  FOR SELECT TO authenticated USING (true);
