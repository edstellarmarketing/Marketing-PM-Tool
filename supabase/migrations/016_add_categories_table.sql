-- Create categories table
CREATE TABLE "Marketing-PM-Tool".categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for name
CREATE INDEX IF NOT EXISTS idx_categories_name ON "Marketing-PM-Tool".categories(name);

-- RLS for categories
ALTER TABLE "Marketing-PM-Tool".categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON "Marketing-PM-Tool".categories
  FOR SELECT USING (true);

CREATE POLICY "categories_admin_all" ON "Marketing-PM-Tool".categories
  FOR ALL TO authenticated
  USING ("Marketing-PM-Tool".is_admin())
  WITH CHECK ("Marketing-PM-Tool".is_admin());

-- Insert some default categories
INSERT INTO "Marketing-PM-Tool".categories (name) VALUES 
  ('Marketing'),
  ('SEO'),
  ('Content'),
  ('Design'),
  ('Development'),
  ('Social Media')
ON CONFLICT (name) DO NOTHING;
