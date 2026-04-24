-- Create schema
CREATE SCHEMA IF NOT EXISTS "Marketing-PM-Tool";

-- Enums
CREATE TYPE "Marketing-PM-Tool".user_role AS ENUM ('admin', 'member');
CREATE TYPE "Marketing-PM-Tool".task_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "Marketing-PM-Tool".task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'blocked');

-- profiles
CREATE TABLE "Marketing-PM-Tool".profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  avatar_url  text,
  role        "Marketing-PM-Tool".user_role NOT NULL DEFAULT 'member',
  department  text,
  joining_date date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- monthly_plans
CREATE TABLE "Marketing-PM-Tool".monthly_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  month      int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year       int NOT NULL,
  goals      jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

-- tasks
CREATE TABLE "Marketing-PM-Tool".tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  plan_id         uuid REFERENCES "Marketing-PM-Tool".monthly_plans(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  category        text,
  priority        "Marketing-PM-Tool".task_priority NOT NULL DEFAULT 'medium',
  status          "Marketing-PM-Tool".task_status NOT NULL DEFAULT 'todo',
  due_date        date,
  completion_date date,
  score_weight    int NOT NULL DEFAULT 10,
  score_earned    int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- task_updates
CREATE TABLE "Marketing-PM-Tool".task_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- monthly_scores
CREATE TABLE "Marketing-PM-Tool".monthly_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  month            int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             int NOT NULL,
  total_tasks      int NOT NULL DEFAULT 0,
  completed_tasks  int NOT NULL DEFAULT 0,
  score_earned     int NOT NULL DEFAULT 0,
  score_possible   int NOT NULL DEFAULT 0,
  completion_rate  numeric(5,2) NOT NULL DEFAULT 0,
  rank             int,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month, year)
);

-- appraisal_snapshots
CREATE TABLE "Marketing-PM-Tool".appraisal_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  financial_year          text NOT NULL,
  total_score             int NOT NULL DEFAULT 0,
  avg_monthly_score       numeric(8,2) NOT NULL DEFAULT 0,
  peak_month              text,
  ai_summary              text,
  ai_strengths            jsonb,
  ai_areas_of_improvement jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, financial_year)
);

-- notifications
CREATE TABLE "Marketing-PM-Tool".notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on tasks
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".tasks
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

-- Auto-create profile on new auth user
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO "Marketing-PM-Tool".profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::"Marketing-PM-Tool".user_role, 'member')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".handle_new_user();
