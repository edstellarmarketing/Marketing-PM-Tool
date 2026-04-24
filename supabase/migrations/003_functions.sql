-- Calculate and upsert monthly_scores for all users for a given month/year
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".calculate_monthly_scores(p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
  v_total int;
  v_completed int;
  v_score_earned int;
  v_score_possible int;
  v_completion_rate numeric;
  v_rank int;
BEGIN
  -- Compute scores per user
  FOR v_user IN SELECT id FROM "Marketing-PM-Tool".profiles LOOP
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'done'),
      COALESCE(SUM(score_earned) FILTER (WHERE status = 'done'), 0),
      COALESCE(SUM(score_weight), 0)
    INTO v_total, v_completed, v_score_earned, v_score_possible
    FROM "Marketing-PM-Tool".tasks
    WHERE user_id = v_user.id
      AND EXTRACT(MONTH FROM COALESCE(due_date, created_at::date)) = p_month
      AND EXTRACT(YEAR  FROM COALESCE(due_date, created_at::date)) = p_year;

    IF v_total > 0 THEN
      v_completion_rate := ROUND((v_completed::numeric / v_total) * 100, 2);
    ELSE
      v_completion_rate := 0;
    END IF;

    INSERT INTO "Marketing-PM-Tool".monthly_scores
      (user_id, month, year, total_tasks, completed_tasks, score_earned, score_possible, completion_rate)
    VALUES
      (v_user.id, p_month, p_year, v_total, v_completed, v_score_earned, v_score_possible, v_completion_rate)
    ON CONFLICT (user_id, month, year) DO UPDATE SET
      total_tasks     = EXCLUDED.total_tasks,
      completed_tasks = EXCLUDED.completed_tasks,
      score_earned    = EXCLUDED.score_earned,
      score_possible  = EXCLUDED.score_possible,
      completion_rate = EXCLUDED.completion_rate;
  END LOOP;

  -- Assign ranks ordered by score_earned DESC, completion_rate DESC
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY month, year
             ORDER BY score_earned DESC, completion_rate DESC
           ) AS rn
    FROM "Marketing-PM-Tool".monthly_scores
    WHERE month = p_month AND year = p_year
  )
  UPDATE "Marketing-PM-Tool".monthly_scores ms
  SET rank = ranked.rn
  FROM ranked
  WHERE ms.id = ranked.id;
END;
$$;

-- Return ranked leaderboard for a given month/year
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_leaderboard(p_month int, p_year int)
RETURNS TABLE (
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  department      text,
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
    ms.score_earned,
    ms.score_possible,
    ms.completion_rate,
    ms.rank
  FROM "Marketing-PM-Tool".monthly_scores ms
  JOIN "Marketing-PM-Tool".profiles p ON p.id = ms.user_id
  WHERE ms.month = p_month AND ms.year = p_year
  ORDER BY ms.rank ASC NULLS LAST;
$$;

-- Aggregate stats for a user's financial year (April → March)
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_annual_stats(p_user_id uuid, p_financial_year text)
RETURNS TABLE (
  month           int,
  year            int,
  score_earned    int,
  score_possible  int,
  completion_rate numeric,
  rank            int
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  -- p_financial_year format: '2025-26'
  WITH fy AS (
    SELECT
      CAST(split_part(p_financial_year, '-', 1) AS int) AS start_year,
      CAST(split_part(p_financial_year, '-', 1) AS int) + 1 AS end_year
  )
  SELECT ms.month, ms.year, ms.score_earned, ms.score_possible, ms.completion_rate, ms.rank
  FROM "Marketing-PM-Tool".monthly_scores ms, fy
  WHERE ms.user_id = p_user_id
    AND (
      (ms.year = fy.start_year AND ms.month >= 4) OR
      (ms.year = fy.end_year   AND ms.month <= 3)
    )
  ORDER BY ms.year, ms.month;
$$;

-- Expose schema to PostgREST
GRANT USAGE ON SCHEMA "Marketing-PM-Tool" TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA "Marketing-PM-Tool" TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "Marketing-PM-Tool" TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA "Marketing-PM-Tool" TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA "Marketing-PM-Tool" TO anon;
