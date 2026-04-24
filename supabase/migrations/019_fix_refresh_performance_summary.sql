-- Guard refresh_performance_summary against firing after user is deleted.
-- The trigger on monthly_scores fires during cascade deletion and calls this
-- function, which previously tried to INSERT into performance_summaries with a
-- user_id that no longer exists in profiles — causing an FK violation.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".refresh_performance_summary(
  p_user_id uuid,
  p_financial_year text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_start_year int;
  v_end_year int;
  v_total_score int;
  v_avg_monthly numeric;
  v_peak_month text;
  v_user_exists boolean;
BEGIN
  -- Bail out if the profile is gone (e.g. during cascade deletion)
  SELECT EXISTS(SELECT 1 FROM "Marketing-PM-Tool".profiles WHERE id = p_user_id)
    INTO v_user_exists;
  IF NOT v_user_exists THEN
    RETURN;
  END IF;

  v_start_year := split_part(p_financial_year, '-', 1)::int;
  v_end_year := v_start_year + 1;

  WITH fy_scores AS (
    SELECT *
    FROM "Marketing-PM-Tool".monthly_scores
    WHERE user_id = p_user_id
      AND (
        (year = v_start_year AND month >= 4)
        OR (year = v_end_year AND month <= 3)
      )
      AND (total_tasks > 0 OR score_possible > 0 OR score_earned > 0)
  ),
  peak AS (
    SELECT month, year, score_earned
    FROM fy_scores
    ORDER BY score_earned DESC, completion_rate DESC, year DESC, month DESC
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT SUM(score_earned) FROM fy_scores), 0),
    COALESCE((SELECT ROUND(AVG(score_earned)::numeric, 2) FROM fy_scores), 0),
    (SELECT month::text || '/' || year::text FROM peak)
  INTO v_total_score, v_avg_monthly, v_peak_month;

  INSERT INTO "Marketing-PM-Tool".performance_summaries (
    user_id,
    financial_year,
    total_score,
    avg_monthly_score,
    peak_month
  )
  VALUES (
    p_user_id,
    p_financial_year,
    v_total_score,
    v_avg_monthly,
    v_peak_month
  )
  ON CONFLICT (user_id, financial_year) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    avg_monthly_score = EXCLUDED.avg_monthly_score,
    peak_month = EXCLUDED.peak_month,
    updated_at = now();
END;
$$;
