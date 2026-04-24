-- Add task_type and complexity columns to tasks.
-- These columns exist in the live DB (added via dashboard) but were missing
-- from migrations. Using IF NOT EXISTS so this is safe to re-run.
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS task_type text
    CHECK (task_type IN ('monthly_task', 'new_implementation', 'ai')),
  ADD COLUMN IF NOT EXISTS complexity text
    CHECK (complexity IN ('easy', 'medium', 'difficult'));

CREATE INDEX IF NOT EXISTS idx_tasks_task_type  ON "Marketing-PM-Tool".tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity ON "Marketing-PM-Tool".tasks(complexity);
