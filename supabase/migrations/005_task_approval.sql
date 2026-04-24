ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected'));

ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT;
