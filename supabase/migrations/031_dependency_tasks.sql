-- Add parent_task_id to tasks for dependency tracking
ALTER TABLE "Marketing-PM-Tool".tasks 
ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE CASCADE;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON "Marketing-PM-Tool".tasks(parent_task_id);
