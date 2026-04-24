-- Neutral performance summaries shown on the member performance page.
CREATE TABLE IF NOT EXISTS "Marketing-PM-Tool".performance_summaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  financial_year    text NOT NULL CHECK (financial_year ~ '^\d{4}-\d{2}$'),
  total_score       int NOT NULL DEFAULT 0,
  avg_monthly_score numeric(8,2) NOT NULL DEFAULT 0,
  peak_month        text,
  summary           text,
  strengths         jsonb NOT NULL DEFAULT '[]',
  growth_areas      jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, financial_year)
);

ALTER TABLE "Marketing-PM-Tool".performance_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "performance_summaries_select" ON "Marketing-PM-Tool".performance_summaries;
CREATE POLICY "performance_summaries_select" ON "Marketing-PM-Tool".performance_summaries
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

DROP POLICY IF EXISTS "performance_summaries_write_admin" ON "Marketing-PM-Tool".performance_summaries;
CREATE POLICY "performance_summaries_write_admin" ON "Marketing-PM-Tool".performance_summaries
  FOR ALL USING ("Marketing-PM-Tool".is_admin())
  WITH CHECK ("Marketing-PM-Tool".is_admin());

DROP TRIGGER IF EXISTS performance_summaries_updated_at ON "Marketing-PM-Tool".performance_summaries;
CREATE TRIGGER performance_summaries_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".performance_summaries
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

GRANT ALL ON TABLE "Marketing-PM-Tool".performance_summaries TO authenticated, service_role;
GRANT SELECT ON TABLE "Marketing-PM-Tool".performance_summaries TO anon;

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".financial_year_for_month(p_month int, p_year int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_month >= 4 THEN p_year::text || '-' || right((p_year + 1)::text, 2)
    ELSE (p_year - 1)::text || '-' || right(p_year::text, 2)
  END;
$$;

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
BEGIN
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

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".on_monthly_score_change_refresh_performance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "Marketing-PM-Tool".refresh_performance_summary(
      OLD.user_id,
      "Marketing-PM-Tool".financial_year_for_month(OLD.month, OLD.year)
    );
    RETURN OLD;
  END IF;

  PERFORM "Marketing-PM-Tool".refresh_performance_summary(
    NEW.user_id,
    "Marketing-PM-Tool".financial_year_for_month(NEW.month, NEW.year)
  );

  IF TG_OP = 'UPDATE'
    AND (OLD.user_id <> NEW.user_id OR OLD.month <> NEW.month OR OLD.year <> NEW.year) THEN
    PERFORM "Marketing-PM-Tool".refresh_performance_summary(
      OLD.user_id,
      "Marketing-PM-Tool".financial_year_for_month(OLD.month, OLD.year)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monthly_scores_refresh_performance_summary ON "Marketing-PM-Tool".monthly_scores;
CREATE TRIGGER monthly_scores_refresh_performance_summary
  AFTER INSERT OR UPDATE OR DELETE ON "Marketing-PM-Tool".monthly_scores
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".on_monthly_score_change_refresh_performance();

INSERT INTO "Marketing-PM-Tool".performance_summaries (
  user_id,
  financial_year,
  total_score,
  avg_monthly_score,
  peak_month
)
SELECT
  grouped.user_id,
  grouped.financial_year,
  SUM(grouped.score_earned)::int AS total_score,
  ROUND(AVG(grouped.score_earned)::numeric, 2) AS avg_monthly_score,
  (
    SELECT ms.month::text || '/' || ms.year::text
    FROM "Marketing-PM-Tool".monthly_scores ms
    WHERE ms.user_id = grouped.user_id
      AND "Marketing-PM-Tool".financial_year_for_month(ms.month, ms.year) = grouped.financial_year
      AND (ms.total_tasks > 0 OR ms.score_possible > 0 OR ms.score_earned > 0)
    ORDER BY ms.score_earned DESC, ms.completion_rate DESC, ms.year DESC, ms.month DESC
    LIMIT 1
  ) AS peak_month
FROM (
  SELECT
    user_id,
    "Marketing-PM-Tool".financial_year_for_month(month, year) AS financial_year,
    score_earned
  FROM "Marketing-PM-Tool".monthly_scores
  WHERE total_tasks > 0 OR score_possible > 0 OR score_earned > 0
) grouped
GROUP BY grouped.user_id, grouped.financial_year
ON CONFLICT (user_id, financial_year) DO UPDATE SET
  total_score = EXCLUDED.total_score,
  avg_monthly_score = EXCLUDED.avg_monthly_score,
  peak_month = EXCLUDED.peak_month,
  updated_at = now();
