-- Grant explicit permissions to the categories table for existing roles
GRANT SELECT ON "Marketing-PM-Tool".categories TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON "Marketing-PM-Tool".categories TO authenticated, service_role;

-- Set default privileges so future tables in this schema automatically have these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA "Marketing-PM-Tool" 
GRANT SELECT ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA "Marketing-PM-Tool" 
GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA "Marketing-PM-Tool" 
GRANT ALL ON SEQUENCES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA "Marketing-PM-Tool" 
GRANT ALL ON FUNCTIONS TO authenticated, service_role;
