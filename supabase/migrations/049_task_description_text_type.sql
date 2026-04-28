-- Ensure task description column uses PostgreSQL text type (unlimited length)
-- This allows storing rich text HTML content of any size from the rich text editor.
ALTER TABLE "Marketing-PM-Tool".tasks
  ALTER COLUMN description TYPE text;
