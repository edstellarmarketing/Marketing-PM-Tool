-- Add published flag to appraisal_snapshots
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Members can see their OWN appraisal only when published
DROP POLICY IF EXISTS "appraisals_select" ON "Marketing-PM-Tool".appraisal_snapshots;

CREATE POLICY "appraisals_select" ON "Marketing-PM-Tool".appraisal_snapshots
  FOR SELECT USING (
    "Marketing-PM-Tool".is_admin()
    OR (user_id = auth.uid() AND published = true)
  );
