CREATE TABLE IF NOT EXISTS "Marketing-PM-Tool".email_settings (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed known settings so they always exist
INSERT INTO "Marketing-PM-Tool".email_settings (key, enabled) VALUES
  ('admin_daily_task_summary', false)
ON CONFLICT (key) DO NOTHING;

-- Only admins can read/write email settings
ALTER TABLE "Marketing-PM-Tool".email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_email_settings"
  ON "Marketing-PM-Tool".email_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
