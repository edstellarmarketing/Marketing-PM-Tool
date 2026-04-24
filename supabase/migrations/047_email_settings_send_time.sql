ALTER TABLE "Marketing-PM-Tool".email_settings
  ADD COLUMN IF NOT EXISTS send_time text NOT NULL DEFAULT '09:00';

-- Set sensible defaults for the two existing settings
UPDATE "Marketing-PM-Tool".email_settings SET send_time = '19:30' WHERE key = 'admin_daily_task_summary';
UPDATE "Marketing-PM-Tool".email_settings SET send_time = '09:00' WHERE key = 'member_daily_digest';
