-- Add approval status to attendance_leaves
ALTER TABLE "Marketing-PM-Tool".attendance_leaves
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));
