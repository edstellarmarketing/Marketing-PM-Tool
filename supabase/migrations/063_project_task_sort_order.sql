-- 063: add sort_order to project_tasks so bulk uploads preserve the spreadsheet order.
--
-- The bulk-upload CSV / XLSX template gets a new "S.No" column. Rows are inserted
-- with sort_order set from that S.No (or, when blank, from the row index in the
-- file), offset by the current MAX(sort_order) for the project so a bulk import
-- always appends after the project's existing tasks instead of clobbering their order.
--
-- Project task lists are ordered by sort_order ASC NULLS LAST, then created_at ASC,
-- so existing rows (backfilled below) fall back to chronological order.

ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- Backfill existing rows: oldest task in each project gets the lowest sort_order.
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
  FROM "Marketing-PM-Tool".project_tasks
  WHERE sort_order IS NULL
)
UPDATE "Marketing-PM-Tool".project_tasks t
SET    sort_order = o.rn
FROM   ordered o
WHERE  t.id = o.id;

CREATE INDEX IF NOT EXISTS project_tasks_project_sort_idx
  ON "Marketing-PM-Tool".project_tasks (project_id, sort_order);
