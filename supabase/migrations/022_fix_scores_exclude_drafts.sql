-- Fix update_user_monthly_score to exclude draft tasks.
-- Previously draft tasks inflated score_possible and total_tasks,
-- making completion_rate and progress bars on the dashboard incorrect.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".update_user_monthly_score(p_user_id uuid, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total int;
  v_completed int;
  v_score_earned int;
  v_score_possible int;
  v_completion_rate numeric;
  v_user_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM "Marketing-PM-Tool".profiles WHERE id = p_user_id)
    INTO v_user_exists;
  IF NOT v_user_exists THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done'),
    COALESCE(SUM(score_earned) FILTER (WHERE status = 'done'), 0),
    COALESCE(SUM(score_weight), 0)
  INTO v_total, v_completed, v_score_earned, v_score_possible
  FROM "Marketing-PM-Tool".tasks
  WHERE user_id = p_user_id
    AND is_draft = false
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
    (p_user_id, p_month, p_year, v_total, v_completed, v_score_earned, v_score_possible, v_completion_rate)
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    total_tasks     = EXCLUDED.total_tasks,
    completed_tasks = EXCLUDED.completed_tasks,
    score_earned    = EXCLUDED.score_earned,
    score_possible  = EXCLUDED.score_possible,
    completion_rate = EXCLUDED.completion_rate;

  -- Re-rank everyone for this month
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
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

-- Recalculate monthly_scores for all users/months to apply the draft exclusion
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      user_id,
      EXTRACT(MONTH FROM COALESCE(due_date, created_at::date))::int AS month,
      EXTRACT(YEAR  FROM COALESCE(due_date, created_at::date))::int AS year
    FROM "Marketing-PM-Tool".tasks
    WHERE is_draft = false
  LOOP
    PERFORM "Marketing-PM-Tool".update_user_monthly_score(r.user_id, r.month, r.year);
  END LOOP;
END;
$$;
