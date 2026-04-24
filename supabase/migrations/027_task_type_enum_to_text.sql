-- tasks.task_type and tasks.complexity were added as PostgreSQL enum types
-- (task_type_enum, complexity_enum) via the Supabase dashboard, so admin-created
-- values fail with: invalid input value for enum task_type_enum: "foo".
-- Convert both columns to text so any string from point_config is valid.

ALTER TABLE "Marketing-PM-Tool".tasks
  ALTER COLUMN task_type  TYPE text USING task_type::text,
  ALTER COLUMN complexity TYPE text USING complexity::text;

-- Drop the now-orphaned enum types (safe — no columns reference them).
-- Use DO block so this works whether or not the types exist / regardless of schema.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, tp.typname AS type_name
    FROM pg_type tp
    JOIN pg_namespace n ON n.oid = tp.typnamespace
    WHERE tp.typtype = 'e'
      AND tp.typname IN ('task_type_enum', 'complexity_enum')
  LOOP
    BEGIN
      EXECUTE format('DROP TYPE IF EXISTS %I.%I', t.schema_name, t.type_name);
    EXCEPTION WHEN dependent_objects_still_exist THEN
      -- If anything still depends on the enum, leave it; the column conversion is what matters.
      RAISE NOTICE 'Enum %.% still referenced elsewhere, leaving in place.', t.schema_name, t.type_name;
    END;
  END LOOP;
END;
$$;
