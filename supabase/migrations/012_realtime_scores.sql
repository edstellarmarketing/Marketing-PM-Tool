-- Function to update a single user's score for a specific month/year
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".update_user_monthly_score(p_user_id uuid, p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total int;
  v_completed int;
  v_score_earned int;
  v_score_possible int;
  v_completion_rate numeric;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done'),
    COALESCE(SUM(score_earned) FILTER (WHERE status = 'done'), 0),
    COALESCE(SUM(score_weight), 0)
  INTO v_total, v_completed, v_score_earned, v_score_possible
  FROM "Marketing-PM-Tool".tasks
  WHERE user_id = p_user_id
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

-- Trigger function for task changes
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".on_task_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_month int;
  v_year int;
  v_user_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_user_id := OLD.user_id;
    v_month   := EXTRACT(MONTH FROM COALESCE(OLD.due_date, OLD.created_at::date));
    v_year    := EXTRACT(YEAR  FROM COALESCE(OLD.due_date, OLD.created_at::date));
  ELSE
    v_user_id := NEW.user_id;
    v_month   := EXTRACT(MONTH FROM COALESCE(NEW.due_date, NEW.created_at::date));
    v_year    := EXTRACT(YEAR  FROM COALESCE(NEW.due_date, NEW.created_at::date));
  END IF;

  PERFORM "Marketing-PM-Tool".update_user_monthly_score(v_user_id, v_month, v_year);
  
  -- If user_id or dates changed, update the other one too
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.user_id != NEW.user_id OR 
        COALESCE(OLD.due_date, OLD.created_at::date) != COALESCE(NEW.due_date, NEW.created_at::date)) THEN
      PERFORM "Marketing-PM-Tool".update_user_monthly_score(
        OLD.user_id, 
        EXTRACT(MONTH FROM COALESCE(OLD.due_date, OLD.created_at::date))::int, 
        EXTRACT(YEAR  FROM COALESCE(OLD.due_date, OLD.created_at::date))::int
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Add trigger to tasks table
DROP TRIGGER IF EXISTS tr_on_task_change ON "Marketing-PM-Tool".tasks;
CREATE TRIGGER tr_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON "Marketing-PM-Tool".tasks
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".on_task_change();

-- Initialize monthly score for new profiles
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".on_profile_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO "Marketing-PM-Tool".monthly_scores (user_id, month, year)
  VALUES (NEW.id, EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_on_profile_created ON "Marketing-PM-Tool".profiles;
CREATE TRIGGER tr_on_profile_created
  AFTER INSERT ON "Marketing-PM-Tool".profiles
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".on_profile_created();
