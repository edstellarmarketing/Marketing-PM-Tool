-- Leaderboard and dashboard should only count tasks whose completion has been
-- approved by an admin. A task in 'pending_approval' still has score_earned set
-- (so it's retained after approval), but it should NOT contribute to the user's
-- monthly total until admin approval.
--
-- Behaviour:
--   status='done' + approval_status='approved'  → counted in score_earned
--   status='done' + approval_status='pending_approval' → not counted yet
--   status='done' + approval_status='rejected'  → not counted
--   status!='done' → not counted (same as before)
--
-- completed_tasks still counts all done tasks (user's progress view), but the
-- score figure only reflects approved work.

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".update_user_monthly_score(p_user_id uuid, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total          int;
  v_completed      int;
  v_score_earned   numeric(8,2);
  v_score_possible numeric(8,2);
  v_completion_rate numeric;
  v_user_exists    boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM "Marketing-PM-Tool".profiles WHERE id = p_user_id)
    INTO v_user_exists;
  IF NOT v_user_exists THEN RETURN; END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done'),
    COALESCE(SUM(score_earned) FILTER (WHERE status = 'done' AND approval_status = 'approved'), 0),
    COALESCE(SUM(score_weight), 0)
  INTO v_total, v_completed, v_score_earned, v_score_possible
  FROM "Marketing-PM-Tool".tasks
  WHERE user_id  = p_user_id
    AND is_draft = false
    AND EXTRACT(MONTH FROM COALESCE(due_date, created_at::date)) = p_month
    AND EXTRACT(YEAR  FROM COALESCE(due_date, created_at::date)) = p_year;

  v_completion_rate := CASE WHEN v_total > 0
    THEN ROUND((v_completed::numeric / v_total) * 100, 2)
    ELSE 0 END;

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

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score_earned DESC, completion_rate DESC) AS rn
    FROM "Marketing-PM-Tool".monthly_scores
    WHERE month = p_month AND year = p_year
  )
  UPDATE "Marketing-PM-Tool".monthly_scores ms
  SET rank = ranked.rn
  FROM ranked WHERE ms.id = ranked.id;
END;
$$;

-- Recalculate every user/month so the new rule takes effect immediately.
DO $$
DECLARE r RECORD;
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
