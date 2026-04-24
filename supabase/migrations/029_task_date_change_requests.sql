-- Date change requests: users can request to change start_date / due_date
-- after a task is created; only admins can approve and apply the change.

CREATE TABLE IF NOT EXISTS "Marketing-PM-Tool".task_date_change_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                uuid NOT NULL REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE CASCADE,
  requested_by           uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  current_start_date     date,
  current_due_date       date,
  requested_start_date   date,
  requested_due_date     date,
  reason                 text,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by            uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  review_note            text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tdcr_task_id ON "Marketing-PM-Tool".task_date_change_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_tdcr_status  ON "Marketing-PM-Tool".task_date_change_requests(status);

-- Only one pending request per task at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_tdcr_one_pending_per_task
  ON "Marketing-PM-Tool".task_date_change_requests(task_id)
  WHERE status = 'pending';

ALTER TABLE "Marketing-PM-Tool".task_date_change_requests ENABLE ROW LEVEL SECURITY;

-- Owner of the underlying task OR admins can read the request
CREATE POLICY "tdcr_select" ON "Marketing-PM-Tool".task_date_change_requests
  FOR SELECT USING (
    requested_by = auth.uid()
    OR "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

-- Only the task owner (or admin) can create a request, and only for their own task
CREATE POLICY "tdcr_insert" ON "Marketing-PM-Tool".task_date_change_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND (
      "Marketing-PM-Tool".is_admin()
      OR EXISTS (
        SELECT 1 FROM "Marketing-PM-Tool".tasks t
        WHERE t.id = task_id AND t.user_id = auth.uid()
      )
    )
  );

-- Only admins can update (approve / reject) a request
CREATE POLICY "tdcr_update_admin" ON "Marketing-PM-Tool".task_date_change_requests
  FOR UPDATE USING ("Marketing-PM-Tool".is_admin());

-- Only admins can delete
CREATE POLICY "tdcr_delete_admin" ON "Marketing-PM-Tool".task_date_change_requests
  FOR DELETE USING ("Marketing-PM-Tool".is_admin());
