-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: update_user_monthly_score (the trigger-backed function) recalculates
-- score_earned / score_possible / etc. on every task change, but its
-- ON CONFLICT DO UPDATE clause never updates bonus_points.  As a result,
-- deleting all of a user's tasks zeros score_earned but leaves whatever
-- bonus_points value was stored in the row.  The dashboard then shows
-- score_earned(0) + bonus_points(stale) = incorrect non-zero score.
--
-- Fix: both update_user_monthly_score and calculate_monthly_scores now
-- compute bonus_points fresh from user_awards for that user/month/year
-- and write it back on every upsert.
--
-- Backfill: the DO $$ block at the end reruns the corrected function for
-- every existing monthly_scores row so stale values are cleaned up.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix update_user_monthly_score (called by the task-change trigger) ──────
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".update_user_monthly_score(p_user_id uuid, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total           int;
  v_completed       int;
  v_score_earned    numeric(8,2);
  v_score_possible  numeric(8,2);
  v_completion_rate numeric;
  v_bonus_points    int;
  v_user_exists     boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM "Marketing-PM-Tool".profiles WHERE id = p_user_id)
    INTO v_user_exists;
  IF NOT v_user_exists THEN RETURN; END IF;

  -- Recalculate task-based figures
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

  -- Derive bonus_points from actual award rows (not from the stale column value)
  SELECT COALESCE(SUM(bonus_points), 0)
  INTO v_bonus_points
  FROM "Marketing-PM-Tool".user_awards
  WHERE user_id = p_user_id
    AND month   = p_month
    AND year    = p_year;

  INSERT INTO "Marketing-PM-Tool".monthly_scores
    (user_id, month, year, total_tasks, completed_tasks, score_earned, score_possible, completion_rate, bonus_points)
  VALUES
    (p_user_id, p_month, p_year, v_total, v_completed, v_score_earned, v_score_possible, v_completion_rate, v_bonus_points)
  ON CONFLICT (user_id, month, year) DO UPDATE SET
    total_tasks     = EXCLUDED.total_tasks,
    completed_tasks = EXCLUDED.completed_tasks,
    score_earned    = EXCLUDED.score_earned,
    score_possible  = EXCLUDED.score_possible,
    completion_rate = EXCLUDED.completion_rate,
    bonus_points    = EXCLUDED.bonus_points;

  -- Re-rank all users for this month by combined score
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY (score_earned + bonus_points) DESC, completion_rate DESC
           ) AS rn
    FROM "Marketing-PM-Tool".monthly_scores
    WHERE month = p_month AND year = p_year
  )
  UPDATE "Marketing-PM-Tool".monthly_scores ms
  SET rank = ranked.rn
  FROM ranked WHERE ms.id = ranked.id;
END;
$$;

-- ── 2. Fix calculate_monthly_scores (called by the admin recalculate endpoint) ─
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".calculate_monthly_scores(p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user            RECORD;
  v_total           int;
  v_completed       int;
  v_score_earned    numeric(8,2);
  v_score_possible  numeric(8,2);
  v_completion_rate numeric;
  v_bonus_points    int;
BEGIN
  FOR v_user IN SELECT id FROM "Marketing-PM-Tool".profiles LOOP
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'done'),
      COALESCE(SUM(score_earned) FILTER (WHERE status = 'done' AND approval_status = 'approved'), 0),
      COALESCE(SUM(score_weight), 0)
    INTO v_total, v_completed, v_score_earned, v_score_possible
    FROM "Marketing-PM-Tool".tasks
    WHERE user_id = v_user.id
      AND is_draft = false
      AND EXTRACT(MONTH FROM COALESCE(due_date, created_at::date)) = p_month
      AND EXTRACT(YEAR  FROM COALESCE(due_date, created_at::date)) = p_year;

    v_completion_rate := CASE WHEN v_total > 0
      THEN ROUND((v_completed::numeric / v_total) * 100, 2)
      ELSE 0 END;

    -- Derive bonus_points from actual award rows
    SELECT COALESCE(SUM(bonus_points), 0)
    INTO v_bonus_points
    FROM "Marketing-PM-Tool".user_awards
    WHERE user_id = v_user.id
      AND month   = p_month
      AND year    = p_year;

    INSERT INTO "Marketing-PM-Tool".monthly_scores
      (user_id, month, year, total_tasks, completed_tasks, score_earned, score_possible, completion_rate, bonus_points)
    VALUES
      (v_user.id, p_month, p_year, v_total, v_completed, v_score_earned, v_score_possible, v_completion_rate, v_bonus_points)
    ON CONFLICT (user_id, month, year) DO UPDATE SET
      total_tasks     = EXCLUDED.total_tasks,
      completed_tasks = EXCLUDED.completed_tasks,
      score_earned    = EXCLUDED.score_earned,
      score_possible  = EXCLUDED.score_possible,
      completion_rate = EXCLUDED.completion_rate,
      bonus_points    = EXCLUDED.bonus_points;
  END LOOP;

  -- Re-rank by combined score DESC
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY month, year
             ORDER BY (score_earned + bonus_points) DESC, completion_rate DESC
           ) AS rn
    FROM "Marketing-PM-Tool".monthly_scores
    WHERE month = p_month AND year = p_year
  )
  UPDATE "Marketing-PM-Tool".monthly_scores ms
  SET rank = ranked.rn
  FROM ranked WHERE ms.id = ranked.id;
END;
$$;

-- ── 3. Backfill: fix every existing monthly_scores row right now ───────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, month, year
    FROM "Marketing-PM-Tool".monthly_scores
  LOOP
    PERFORM "Marketing-PM-Tool".update_user_monthly_score(r.user_id, r.month, r.year);
  END LOOP;
END;
$$;
