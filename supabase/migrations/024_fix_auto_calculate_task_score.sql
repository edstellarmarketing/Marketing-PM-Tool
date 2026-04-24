-- Fix auto_calculate_task_score: when task_type or complexity is missing,
-- the original function zeroed out score_weight, wiping the DB default of 10.
-- Now: leave score_weight unchanged when either field is unset; only set
-- score_earned based on status (done → score_weight, else → 0).
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".auto_calculate_task_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type_weight    numeric(6,2) := 1.0;
  v_complexity_weight numeric(6,2) := 1.0;
  v_potential      numeric(6,2) := 0;
  v_before_mult    numeric(6,2) := 1.5;
  v_on_mult        numeric(6,2) := 1.0;
  v_late_penalty   numeric(6,2) := 0.1;
  v_days_late      int;
BEGIN
  IF NEW.task_type IS NOT NULL AND NEW.complexity IS NOT NULL THEN
    -- Full classification: calculate score_weight and deadline-adjusted score_earned
    SELECT config_value INTO v_type_weight       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'task_type_'   || NEW.task_type::text;
    SELECT config_value INTO v_complexity_weight FROM "Marketing-PM-Tool".point_config WHERE config_key = 'complexity_'  || NEW.complexity::text;
    SELECT config_value INTO v_before_mult       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_before_multiplier';
    SELECT config_value INTO v_on_mult           FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_on_multiplier';
    SELECT config_value INTO v_late_penalty      FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_after_penalty_per_day';

    v_potential      := ROUND(COALESCE(v_type_weight, 1.0) * COALESCE(v_complexity_weight, 1.0), 2);
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
    -- Partial or no classification: keep existing score_weight (DB default 10),
    -- just sync score_earned to status.
    IF NEW.status = 'done' THEN
      NEW.score_earned := NEW.score_weight;
    ELSE
      NEW.score_earned := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill tasks that were zeroed out by the old trigger:
-- restore score_weight to DB default (10) for unclassified tasks with 0 weight.
UPDATE "Marketing-PM-Tool".tasks
SET score_weight = 10
WHERE score_weight = 0
  AND (task_type IS NULL OR complexity IS NULL);

-- Sync score_earned for done tasks that now have a non-zero score_weight.
UPDATE "Marketing-PM-Tool".tasks
SET score_earned = score_weight
WHERE status = 'done'
  AND score_earned = 0
  AND score_weight > 0
  AND (task_type IS NULL OR complexity IS NULL);

-- Recalculate monthly_scores for all affected users/months.
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
