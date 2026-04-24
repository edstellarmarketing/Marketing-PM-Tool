-- ── Award Types ───────────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".award_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  icon          text NOT NULL DEFAULT '🏅',
  bonus_points  int  NOT NULL DEFAULT 25,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES "Marketing-PM-Tool".profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── User Awards ───────────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".user_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  award_type_id   uuid NOT NULL REFERENCES "Marketing-PM-Tool".award_types(id),
  task_id         uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE SET NULL,
  awarded_by      uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id),
  note            text,
  bonus_points    int  NOT NULL,
  month           int  NOT NULL,
  year            int  NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_awards_user  ON "Marketing-PM-Tool".user_awards(user_id);
CREATE INDEX idx_user_awards_month ON "Marketing-PM-Tool".user_awards(user_id, year, month);
CREATE INDEX idx_user_awards_recent ON "Marketing-PM-Tool".user_awards(created_at DESC);

-- ── Add bonus_points column to monthly_scores ─────────────────────────────────
ALTER TABLE "Marketing-PM-Tool".monthly_scores
  ADD COLUMN IF NOT EXISTS bonus_points int NOT NULL DEFAULT 0;

-- ── RLS Policies ──────────────────────────────────────────────────────────────
ALTER TABLE "Marketing-PM-Tool".award_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".user_awards ENABLE ROW LEVEL SECURITY;

-- award_types: all authenticated users can read, only admins can write
CREATE POLICY "award_types_select" ON "Marketing-PM-Tool".award_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "award_types_insert" ON "Marketing-PM-Tool".award_types
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "award_types_update" ON "Marketing-PM-Tool".award_types
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "award_types_delete" ON "Marketing-PM-Tool".award_types
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- user_awards: all authenticated users can read (awards are public recognition on leaderboard)
CREATE POLICY "user_awards_select_all" ON "Marketing-PM-Tool".user_awards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_awards_insert" ON "Marketing-PM-Tool".user_awards
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "user_awards_delete" ON "Marketing-PM-Tool".user_awards
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Seed 10 default award types ───────────────────────────────────────────────
INSERT INTO "Marketing-PM-Tool".award_types (name, description, icon, bonus_points) VALUES
  ('Milestone Achieved',    'A task directly caused a measurable milestone (e.g., hitting 1,000 followers, a campaign generating 10x normal leads).', '🏆', 50),
  ('Innovative Execution',  'Task was completed using a novel approach that saved time or amplified results beyond expectations.',                        '💡', 40),
  ('Critical Problem Solver','Task resolved a blocker the team had been struggling with, unblocking downstream work.',                                  '🛡️', 45),
  ('Speed Champion',        'Task completed significantly ahead of deadline without sacrificing quality.',                                               '⚡', 30),
  ('Quality Pioneer',       'Delivered on first attempt with zero revisions required. Raised the bar for what "done" looks like.',                       '💎', 35),
  ('Team Catalyst',         'Task unblocked or accelerated the work of two or more other team members.',                                                '🔗', 40),
  ('Impact Creator',        'Task produced a clear, quantifiable business outcome that went beyond its original scope or KPI target.',                  '📈', 50),
  ('Streak Master',         'User has been a top-3 performer for three or more consecutive months.',                                                    '🔥', 60),
  ('Above & Beyond',        'Extraordinary effort that doesn''t fit another category — extra hours, stepping in for a colleague, or a hard task.',      '⭐', 35),
  ('First Blood',           'First person on the team to complete a brand-new type of task or initiative, paving the way for others.',                  '🥇', 25);

-- ── Update get_leaderboard to include bonus_points ────────────────────────────
DROP FUNCTION IF EXISTS "Marketing-PM-Tool".get_leaderboard(int, int);
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".get_leaderboard(p_month int, p_year int)
RETURNS TABLE (
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  department      text,
  designation     text,
  score_earned    int,
  score_possible  int,
  completion_rate numeric,
  bonus_points    int,
  rank            int
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    ms.user_id,
    p.full_name,
    p.avatar_url,
    p.department,
    p.designation,
    ms.score_earned,
    ms.score_possible,
    ms.completion_rate,
    ms.bonus_points,
    ms.rank
  FROM "Marketing-PM-Tool".monthly_scores ms
  JOIN "Marketing-PM-Tool".profiles p ON p.id = ms.user_id
  WHERE ms.month = p_month AND ms.year = p_year
  ORDER BY ms.rank ASC NULLS LAST;
$$;

-- ── Update calculate_monthly_scores to rank by combined score ─────────────────
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".calculate_monthly_scores(p_month int, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
  v_total int;
  v_completed int;
  v_score_earned int;
  v_score_possible int;
  v_completion_rate numeric;
BEGIN
  FOR v_user IN SELECT id FROM "Marketing-PM-Tool".profiles LOOP
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'done'),
      COALESCE(SUM(score_earned) FILTER (WHERE status = 'done'), 0),
      COALESCE(SUM(score_weight), 0)
    INTO v_total, v_completed, v_score_earned, v_score_possible
    FROM "Marketing-PM-Tool".tasks
    WHERE user_id = v_user.id
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
      (v_user.id, p_month, p_year, v_total, v_completed, v_score_earned, v_score_possible, v_completion_rate)
    ON CONFLICT (user_id, month, year) DO UPDATE SET
      total_tasks     = EXCLUDED.total_tasks,
      completed_tasks = EXCLUDED.completed_tasks,
      score_earned    = EXCLUDED.score_earned,
      score_possible  = EXCLUDED.score_possible,
      completion_rate = EXCLUDED.completion_rate;
  END LOOP;

  -- Rank by combined score (task score + bonus points) DESC
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
  FROM ranked
  WHERE ms.id = ranked.id;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT ALL ON "Marketing-PM-Tool".award_types TO authenticated, service_role;
GRANT ALL ON "Marketing-PM-Tool".user_awards TO authenticated, service_role;
