alter table "Marketing-PM-Tool".tasks
  add column if not exists start_date date,
  add column if not exists subtasks jsonb default '[]'::jsonb;
