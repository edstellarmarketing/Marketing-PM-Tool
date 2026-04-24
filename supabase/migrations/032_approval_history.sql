-- Add FK on tasks.approved_by so PostgREST can join reviewer profile
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS approved_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_approved_by_fkey'
  ) THEN
    ALTER TABLE "Marketing-PM-Tool".tasks
      ADD CONSTRAINT tasks_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Performance indexes for the approval history queries
CREATE INDEX IF NOT EXISTS idx_tasks_approval_history
  ON "Marketing-PM-Tool".tasks(status, approval_status, approved_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_tdcr_history
  ON "Marketing-PM-Tool".task_date_change_requests(status, reviewed_at DESC NULLS LAST);
