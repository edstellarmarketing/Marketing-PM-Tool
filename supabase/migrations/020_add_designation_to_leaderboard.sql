-- Add designation to the get_leaderboard RPC return set
-- Must drop first because return type (OUT parameters) is changing
DROP FUNCTION IF EXISTS "Marketing-PM-Tool".get_leaderboard(integer, integer);

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_leaderboard(p_month int, p_year int)
RETURNS TABLE (
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  department      text,
  designation     text,
  score_earned    int,
  score_possible  int,
  completion_rate numeric,
  rank            int
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    ms.user_id,
    p.full_name,
    p.avatar_url,
    p.department,
    p.designation,
    ms.score_earned,
    ms.score_possible,
    ms.completion_rate,
    ms.rank
  FROM "Marketing-PM-Tool".monthly_scores ms
  JOIN "Marketing-PM-Tool".profiles p ON p.id = ms.user_id
  WHERE ms.month = p_month AND ms.year = p_year
  ORDER BY ms.rank ASC NULLS LAST;
$$;
