-- Add optional link column to notifications so recipients can navigate directly to the related resource
ALTER TABLE "Marketing-PM-Tool".notifications
  ADD COLUMN IF NOT EXISTS link text;
