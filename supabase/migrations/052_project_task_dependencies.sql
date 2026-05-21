-- Free-text dependency fields per project task. Kept as plain text rather than
-- foreign keys so dependencies can reference work that lives outside this project.

ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN dependency_task    text,
  ADD COLUMN dependency_details text,
  ADD COLUMN dependency_status  text,
  ADD COLUMN dependency_owner   text;
