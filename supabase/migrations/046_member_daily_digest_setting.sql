INSERT INTO "Marketing-PM-Tool".email_settings (key, enabled)
VALUES ('member_daily_digest', false)
ON CONFLICT (key) DO NOTHING;
