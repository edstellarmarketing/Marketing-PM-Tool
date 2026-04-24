-- Add ai_development_roadmap to appraisal_snapshots
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots 
ADD COLUMN IF NOT EXISTS ai_development_roadmap jsonb;

-- Function to get category stats for a user's financial year
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_annual_category_stats(p_user_id uuid, p_financial_year text)
RETURNS TABLE (
  category        text,
  score_earned    int,
  score_possible  int,
  completion_rate numeric,
  task_count      int
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH fy AS (
    SELECT
      CAST(split_part(p_financial_year, '-', 1) AS int) AS start_year,
      CAST(split_part(p_financial_year, '-', 1) AS int) + 1 AS end_year
  ),
  user_tasks AS (
    SELECT 
      COALESCE(category, 'Uncategorized') as category,
      score_earned,
      score_weight,
      status
    FROM "Marketing-PM-Tool".tasks, fy
    WHERE user_id = p_user_id
      AND (
        (EXTRACT(YEAR FROM COALESCE(due_date, created_at::date)) = fy.start_year AND EXTRACT(MONTH FROM COALESCE(due_date, created_at::date)) >= 4) OR
        (EXTRACT(YEAR FROM COALESCE(due_date, created_at::date)) = fy.end_year   AND EXTRACT(MONTH FROM COALESCE(due_date, created_at::date)) <= 3)
      )
  )
  SELECT 
    category,
    SUM(CASE WHEN status = 'done' THEN score_earned ELSE 0 END)::int as score_earned,
    SUM(score_weight)::int as score_possible,
    CASE 
      WHEN SUM(score_weight) > 0 THEN ROUND((SUM(CASE WHEN status = 'done' THEN score_earned ELSE 0 END)::numeric / SUM(score_weight)) * 100, 2)
      ELSE 0 
    END as completion_rate,
    COUNT(*)::int as task_count
  FROM user_tasks
  GROUP BY category
  ORDER BY score_earned DESC;
$$;
