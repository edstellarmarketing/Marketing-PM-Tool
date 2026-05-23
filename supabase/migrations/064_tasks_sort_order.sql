-- 064: add sort_order to tasks so personal bulk uploads (and the /tasks list) honour
-- a user-specified order.
--
-- The /tasks/new page now exposes a "Bulk Upload Tasks" modal that ships an S.No column
-- in its CSV/XLSX template. Imported rows are inserted with sort_order set from that
-- S.No (after the user's current MAX), so the spreadsheet order becomes the visible
-- order on /tasks. The list orders by sort_order ASC NULLS LAST, then due_date.
--
-- Backfill assigns each existing user's tasks a chronological sort_order so legacy data
-- has a sensible value.

ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM "Marketing-PM-Tool".tasks
  WHERE sort_order IS NULL
)
UPDATE "Marketing-PM-Tool".tasks t
SET    sort_order = o.rn
FROM   ordered o
WHERE  t.id = o.id;

CREATE INDEX IF NOT EXISTS tasks_user_sort_idx
  ON "Marketing-PM-Tool".tasks (user_id, sort_order);
