-- Add award_bonus column to appraisal_snapshots to track bonus points separately
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots
  ADD COLUMN IF NOT EXISTS award_bonus integer NOT NULL DEFAULT 0;
