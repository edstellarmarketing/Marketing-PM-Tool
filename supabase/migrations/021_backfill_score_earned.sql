-- Backfill score_earned for tasks that are done but have score_earned = 0.
-- This happened because the tasks_auto_score trigger was assumed to exist
-- but was never created — score_earned was left at its default of 0.
UPDATE "Marketing-PM-Tool".tasks
SET score_earned = score_weight
WHERE status = 'done'
  AND score_earned = 0
  AND score_weight > 0;

-- Refresh monthly_scores for all affected users/months so the leaderboard
-- and performance summaries reflect the corrected scores.
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
    WHERE status = 'done'
  LOOP
    PERFORM "Marketing-PM-Tool".update_user_monthly_score(r.user_id, r.month, r.year);
  END LOOP;
END;
$$;
