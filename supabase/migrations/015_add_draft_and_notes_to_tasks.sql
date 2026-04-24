-- Add draft and strategic notes to tasks for the new planning workflow
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strategic_notes text;

-- Index for performance when filtering drafts
CREATE INDEX IF NOT EXISTS idx_tasks_is_draft ON "Marketing-PM-Tool".tasks(is_draft);
