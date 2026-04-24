-- Allow admin-created task types and complexities.
-- Drop the hardcoded CHECK constraints so any value stored in point_config is valid.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'Marketing-PM-Tool'
      AND table_name   = 'tasks'
      AND constraint_type = 'CHECK'
      AND (constraint_name ILIKE '%task_type%' OR constraint_name ILIKE '%complexity%')
  LOOP
    EXECUTE format('ALTER TABLE "Marketing-PM-Tool".tasks DROP CONSTRAINT %I', r.constraint_name);
  END LOOP;
END;
$$;
