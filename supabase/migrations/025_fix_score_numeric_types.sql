-- Two bugs causing scores to show as 0:
-- 1. auto_calculate_task_score formula = type_mult × complexity_mult (e.g. 0.50×0.50=0.25)
--    Missing the base multiplier of 10, so scores were 0.25–2.25 instead of 2.5–22.5.
-- 2. update_user_monthly_score declared v_score_earned/v_score_possible as int,
--    truncating decimal sums (e.g. 0.38 → 0) before writing to monthly_scores.
-- Fix: add base 10, change variables + columns to numeric.

-- Step 1: Change monthly_scores columns from int to numeric
ALTER TABLE "Marketing-PM-Tool".monthly_scores
  ALTER COLUMN score_earned  TYPE numeric(8,2) USING score_earned::numeric,
  ALTER COLUMN score_possible TYPE numeric(8,2) USING score_possible::numeric;

-- Step 2: Fix auto_calculate_task_score — add base 10 to formula
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".auto_calculate_task_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type_weight       numeric(6,2) := 1.0;
  v_complexity_weight numeric(6,2) := 1.0;
  v_potential         numeric(8,2) := 0;
  v_before_mult       numeric(6,2) := 1.5;
  v_on_mult           numeric(6,2) := 1.0;
  v_late_penalty      numeric(6,2) := 0.1;
  v_days_late         int;
BEGIN
  IF NEW.task_type IS NOT NULL AND NEW.complexity IS NOT NULL THEN
    SELECT config_value INTO v_type_weight       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'task_type_'  || NEW.task_type::text;
    SELECT config_value INTO v_complexity_weight FROM "Marketing-PM-Tool".point_config WHERE config_key = 'complexity_' || NEW.complexity::text;
    SELECT config_value INTO v_before_mult       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_before_multiplier';
    SELECT config_value INTO v_on_mult           FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_on_multiplier';
    SELECT config_value INTO v_late_penalty      FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_after_penalty_per_day';

    -- Base 10 × type_multiplier × complexity_multiplier
    v_potential      := ROUND(10.0 * COALESCE(v_type_weight, 1.0) * COALESCE(v_complexity_weight, 1.0), 2);
    NEW.score_weight := v_potential;

    IF NEW.status = 'done' THEN
      IF NEW.due_date IS NULL OR NEW.completion_date IS NULL THEN
        NEW.score_earned := ROUND(v_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSIF NEW.completion_date < NEW.due_date THEN
        NEW.score_earned := ROUND(v_potential * COALESCE(v_before_mult, 1.5), 2);
      ELSIF NEW.completion_date = NEW.due_date THEN
        NEW.score_earned := ROUND(v_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSE
        v_days_late      := (NEW.completion_date - NEW.due_date)::int;
        NEW.score_earned := GREATEST(0, ROUND(v_potential - COALESCE(v_late_penalty, 0.1) * v_days_late, 2));
      END IF;
    ELSE
      NEW.score_earned := 0;
    END IF;

  ELSE
    -- No classification: keep existing score_weight, sync score_earned to status
    IF NEW.status = 'done' THEN
      NEW.score_earned := NEW.score_weight;
    ELSE
      NEW.score_earned := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: Fix update_user_monthly_score — use numeric variables
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
    COALESCE(SUM(score_earned)  FILTER (WHERE status = 'done'), 0),
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

-- Step 4: Fix get_leaderboard return types to numeric
DROP FUNCTION IF EXISTS "Marketing-PM-Tool".get_leaderboard(integer, integer);
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_leaderboard(p_month int, p_year int)
RETURNS TABLE (
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  department      text,
  designation     text,
  score_earned    numeric,
  score_possible  numeric,
  completion_rate numeric,
  rank            int
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ms.user_id, p.full_name, p.avatar_url, p.department, p.designation,
         ms.score_earned, ms.score_possible, ms.completion_rate, ms.rank
  FROM "Marketing-PM-Tool".monthly_scores ms
  JOIN "Marketing-PM-Tool".profiles p ON p.id = ms.user_id
  WHERE ms.month = p_month AND ms.year = p_year
  ORDER BY ms.rank ASC NULLS LAST;
$$;

-- Step 5: Retrigger score calculation for all classified tasks
-- The BEFORE trigger auto_calculate_task_score will recalculate with base 10.
UPDATE "Marketing-PM-Tool".tasks
SET updated_at = now()
WHERE task_type IS NOT NULL
  AND complexity IS NOT NULL
  AND is_draft = false;

-- Step 6: Recalculate monthly_scores for all users/months
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
