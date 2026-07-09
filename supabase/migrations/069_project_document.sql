-- ─────────────────────────────────────────────────────────────────────────────
-- Project documents (multiple HTML / Word files per project)
--
-- A project manager (admin or team-lead creator) can attach supporting documents
-- to a project — HTML pages or Word docs (.doc/.docx). Each shows as a
-- "Project Document" button beside the project name and opens in a new tab.
--
-- Storage lives in a private bucket; the API uploads with the service role and
-- serves reads via short-lived signed URLs (same pattern as task/announcement
-- attachments — see migration 060).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. project_documents ─────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".project_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".projects(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL CHECK (mime_type IN (
                  'text/html',
                  'application/msword',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                )),
  size_bytes    int  NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by   uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_documents_project_idx ON "Marketing-PM-Tool".project_documents (project_id);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Projects RLS is admin-only (migration 056) and project management for team
-- leads is enforced in the route handler with the service-role client. We mirror
-- that here: authenticated users may read (the API layer decides visibility);
-- writes go through the service role, so no client-side write policy is needed.
ALTER TABLE "Marketing-PM-Tool".project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_documents_select_admin" ON "Marketing-PM-Tool".project_documents
  FOR SELECT TO authenticated
  USING ("Marketing-PM-Tool".is_admin());

-- ── 3. Storage bucket (private) ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('project-documents', 'project-documents', false, 10485760,
   ARRAY[
     'text/html',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ])
ON CONFLICT (id) DO NOTHING;

-- ── 4. Storage object policy (defense in depth) ──────────────────────────────
-- Clients never touch objects directly: the API layer uploads with the service
-- role and mints signed URLs for reads. We still install an admin-only policy so
-- nobody can list/browse the bucket through an authenticated client.
CREATE POLICY "project_documents_storage_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'project-documents' AND "Marketing-PM-Tool".is_admin())
  WITH CHECK (bucket_id = 'project-documents' AND "Marketing-PM-Tool".is_admin());

-- ── 5. Grants ────────────────────────────────────────────────────────────────
GRANT ALL ON "Marketing-PM-Tool".project_documents TO authenticated, service_role;
