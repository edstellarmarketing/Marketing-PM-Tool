-- Add half-day flag to attendance_leaves
ALTER TABLE "Marketing-PM-Tool".attendance_leaves
  ADD COLUMN IF NOT EXISTS is_half_day boolean NOT NULL DEFAULT false;
