-- Add attendance AI insight column to appraisal_snapshots
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots
  ADD COLUMN IF NOT EXISTS ai_attendance_insight text;
