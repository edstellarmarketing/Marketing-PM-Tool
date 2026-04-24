-- Add sender_id to notifications so the UI can show who sent each notification
ALTER TABLE "Marketing-PM-Tool".notifications
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL;
