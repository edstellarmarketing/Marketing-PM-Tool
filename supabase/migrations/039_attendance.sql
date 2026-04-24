-- ── Attendance Leaves ────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".attendance_leaves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  date        date NOT NULL,
  leave_type  text NOT NULL CHECK (leave_type IN ('sick', 'casual')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE "Marketing-PM-Tool".attendance_leaves ENABLE ROW LEVEL SECURITY;

-- Members: read/write own rows only
CREATE POLICY "attendance_leaves_own"
  ON "Marketing-PM-Tool".attendance_leaves
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins: read all rows
CREATE POLICY "attendance_leaves_admin_read"
  ON "Marketing-PM-Tool".attendance_leaves
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX ON "Marketing-PM-Tool".attendance_leaves (user_id, date DESC);
CREATE INDEX ON "Marketing-PM-Tool".attendance_leaves (date);

-- ── Seed Perfect Attendance award type ──────────────────────────────────────
INSERT INTO "Marketing-PM-Tool".award_types (name, description, icon, bonus_points)
VALUES (
  'Perfect Attendance',
  'No sick or casual leaves taken during the entire month.',
  '🎯',
  25
)
ON CONFLICT DO NOTHING;
