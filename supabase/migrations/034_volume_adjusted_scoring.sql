-- Volume-Adjusted Scoring System
-- Adds a Subtask Volume bonus to the complexity weight, configurable via point_config.
--
-- Formula:
--   potential_score = 10 × task_type_weight × (complexity_weight + volume_bonus)
--
-- The bonus is determined by counting subtasks. score_weight (potential) uses
-- total subtask count; score_earned (final) uses only COMPLETED subtasks at the
-- time the task moves to 'done', which prevents users gaming the bonus.

-- Step 1: Seed configurable thresholds and bonuses (admin-tunable via point_config UI)
INSERT INTO "Marketing-PM-Tool".point_config (config_key, config_value, label, description, category)
VALUES
  ('volume_threshold_significant', 4,   'Significant Volume Threshold', 'Subtasks needed for +0.2 bonus', 'complexity'),
  ('volume_threshold_substantial', 8,   'Substantial Volume Threshold', 'Subtasks needed for +0.5 bonus', 'complexity'),
  ('volume_threshold_massive',     16,  'Massive Volume Threshold',     'Subtasks needed for +1.0 bonus', 'complexity'),
  ('volume_bonus_significant',     0.2, 'Significant Volume Bonus',     '4-7 subtasks',  'complexity'),
  ('volume_bonus_substantial',     0.5, 'Substantial Volume Bonus',     '8-15 subtasks', 'complexity'),
  ('volume_bonus_massive',         1.0, 'Massive Volume Bonus',         '16+ subtasks',  'complexity')
ON CONFLICT (config_key) DO NOTHING;

-- Step 2: Replace auto_calculate_task_score with the volume-aware version
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".auto_calculate_task_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type_weight        numeric(6,2) := 1.0;
  v_complexity_weight  numeric(6,2) := 1.0;
  v_potential          numeric(8,2) := 0;
  v_earned_potential   numeric(8,2) := 0;
  v_before_mult        numeric(6,2) := 1.5;
  v_on_mult            numeric(6,2) := 1.0;
  v_late_penalty       numeric(6,2) := 0.1;
  v_days_late          int;
  v_total_subs         int := 0;
  v_completed_subs     int := 0;
  v_t_significant      int := 4;
  v_t_substantial      int := 8;
  v_t_massive          int := 16;
  v_b_significant      numeric(6,2) := 0.2;
  v_b_substantial      numeric(6,2) := 0.5;
  v_b_massive          numeric(6,2) := 1.0;
  v_potential_bonus    numeric(6,2) := 0;
  v_earned_bonus       numeric(6,2) := 0;
BEGIN
  -- Subtask counts (always computed; safe when subtasks is null)
  IF NEW.subtasks IS NOT NULL AND jsonb_typeof(NEW.subtasks) = 'array' THEN
    v_total_subs := jsonb_array_length(NEW.subtasks);
    SELECT COUNT(*) INTO v_completed_subs
    FROM jsonb_array_elements(NEW.subtasks) AS s
    WHERE COALESCE((s->>'completed')::boolean, false) = true;
  END IF;

  IF NEW.task_type IS NOT NULL AND NEW.complexity IS NOT NULL THEN
    SELECT config_value INTO v_type_weight       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'task_type_'  || NEW.task_type::text;
    SELECT config_value INTO v_complexity_weight FROM "Marketing-PM-Tool".point_config WHERE config_key = 'complexity_' || NEW.complexity::text;
    SELECT config_value INTO v_before_mult       FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_before_multiplier';
    SELECT config_value INTO v_on_mult           FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_on_multiplier';
    SELECT config_value INTO v_late_penalty      FROM "Marketing-PM-Tool".point_config WHERE config_key = 'deadline_after_penalty_per_day';

    SELECT config_value INTO v_t_significant FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_threshold_significant';
    SELECT config_value INTO v_t_substantial FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_threshold_substantial';
    SELECT config_value INTO v_t_massive     FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_threshold_massive';
    SELECT config_value INTO v_b_significant FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_bonus_significant';
    SELECT config_value INTO v_b_substantial FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_bonus_substantial';
    SELECT config_value INTO v_b_massive     FROM "Marketing-PM-Tool".point_config WHERE config_key = 'volume_bonus_massive';

    -- Potential uses TOTAL subtask count so the live preview reflects the planned bonus
    v_potential_bonus := CASE
      WHEN v_total_subs >= COALESCE(v_t_massive, 16)     THEN COALESCE(v_b_massive, 1.0)
      WHEN v_total_subs >= COALESCE(v_t_substantial, 8)  THEN COALESCE(v_b_substantial, 0.5)
      WHEN v_total_subs >= COALESCE(v_t_significant, 4)  THEN COALESCE(v_b_significant, 0.2)
      ELSE 0
    END;

    v_potential      := ROUND(10.0 * COALESCE(v_type_weight, 1.0) * (COALESCE(v_complexity_weight, 1.0) + v_potential_bonus), 2);
    NEW.score_weight := v_potential;

    IF NEW.status = 'done' THEN
      -- Earned uses COMPLETED subtask count to prevent fake-subtask gaming
      v_earned_bonus := CASE
        WHEN v_completed_subs >= COALESCE(v_t_massive, 16)     THEN COALESCE(v_b_massive, 1.0)
        WHEN v_completed_subs >= COALESCE(v_t_substantial, 8)  THEN COALESCE(v_b_substantial, 0.5)
        WHEN v_completed_subs >= COALESCE(v_t_significant, 4)  THEN COALESCE(v_b_significant, 0.2)
        ELSE 0
      END;
      v_earned_potential := ROUND(10.0 * COALESCE(v_type_weight, 1.0) * (COALESCE(v_complexity_weight, 1.0) + v_earned_bonus), 2);

      IF NEW.due_date IS NULL OR NEW.completion_date IS NULL THEN
        NEW.score_earned := ROUND(v_earned_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSIF NEW.completion_date < NEW.due_date THEN
        NEW.score_earned := ROUND(v_earned_potential * COALESCE(v_before_mult, 1.5), 2);
      ELSIF NEW.completion_date = NEW.due_date THEN
        NEW.score_earned := ROUND(v_earned_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSE
        v_days_late      := (NEW.completion_date - NEW.due_date)::int;
        NEW.score_earned := GREATEST(0, ROUND(v_earned_potential - COALESCE(v_late_penalty, 0.1) * v_days_late, 2));
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

-- Step 3: Recalculate scores on existing classified, non-draft tasks so the volume
-- bonus is applied retroactively where applicable.
UPDATE "Marketing-PM-Tool".tasks
SET updated_at = now()
WHERE task_type IS NOT NULL
  AND complexity IS NOT NULL
  AND is_draft = false;

-- Step 4: Refresh monthly scores after recalc
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
