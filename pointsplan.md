# Automated Points System — Implementation Plan

## 1. Overview

Replace the current manual `score_weight` field (user-editable int) with a fully automated scoring engine. Points are calculated by the database, not users. Admins control the weight table. Users see potential and earned scores transparently.

---

## 2. Scoring Formula

### 2.1 Potential Score (shown at task creation)

```
potential_score = task_type_weight × complexity_weight
```

| Task Type           | Weight |
|---------------------|--------|
| Monthly Task        | 0.5    |
| New Implementation  | 1.0    |
| AI                  | 1.5    |

| Complexity | Weight |
|------------|--------|
| Easy       | 0.5    |
| Medium     | 1.0    |
| Difficult  | 1.5    |

**Examples:**
- Monthly Task + Easy → 0.5 × 0.5 = **0.25 pts**
- New Implementation + Medium → 1.0 × 1.0 = **1.00 pts**
- AI + Difficult → 1.5 × 1.5 = **2.25 pts**

### 2.2 Earned Score (calculated when task is closed as `done`)

```
earned_score = deadline_adjustment(potential_score, due_date, completion_date)
```

| Scenario                  | Formula                                          |
|---------------------------|--------------------------------------------------|
| Closed **before** deadline | `potential_score × 1.5`                         |
| Closed **on** deadline     | `potential_score × 1.0`                         |
| Closed **after** deadline  | `MAX(0, potential_score − 0.1 × days_exceeded)` |
| No deadline set            | `potential_score × 1.0` (treated as on-time)    |

**Example — AI + Difficult (potential = 2.25), closed 4 days late:**
```
earned = MAX(0, 2.25 − 0.1 × 4) = MAX(0, 1.85) = 1.85 pts
```

### 2.3 Rounding
All scores stored as `numeric(6,2)` — rounded to 2 decimal places.

---

## 3. Supabase Database Plan

### 3.1 New Enum Types (Migration 019)

```sql
CREATE TYPE "Marketing-PM-Tool".task_type_enum AS ENUM (
  'monthly_task',
  'new_implementation',
  'ai'
);

CREATE TYPE "Marketing-PM-Tool".complexity_enum AS ENUM (
  'easy',
  'medium',
  'difficult'
);
```

### 3.2 New Table: `point_config`

Stores all admin-configurable weights. Seeded with defaults on migration.

```sql
CREATE TABLE "Marketing-PM-Tool".point_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   text UNIQUE NOT NULL,
  config_value numeric(6,2) NOT NULL,
  label        text NOT NULL,
  description  text,
  category     text NOT NULL,         -- 'task_type' | 'complexity' | 'deadline'
  updated_by   uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Default seed values
INSERT INTO "Marketing-PM-Tool".point_config
  (config_key, config_value, label, description, category)
VALUES
  -- Task type weights
  ('task_type_monthly_task',       0.5,  'Monthly Task',        'Recurring monthly operational task',            'task_type'),
  ('task_type_new_implementation', 1.0,  'New Implementation',  'New feature, project, or process rollout',      'task_type'),
  ('task_type_ai',                 1.5,  'AI',                  'AI-driven task requiring prompt/model work',    'task_type'),
  -- Complexity weights
  ('complexity_easy',              0.5,  'Easy',                'Low effort, clear requirements',                'complexity'),
  ('complexity_medium',            1.0,  'Medium',              'Moderate effort, some unknowns',                'complexity'),
  ('complexity_difficult',         1.5,  'Difficult',           'High effort, ambiguous or complex scope',       'complexity'),
  -- Deadline multipliers
  ('deadline_before_multiplier',   1.5,  'Early Completion',    'Multiplier when closed before due date',        'deadline'),
  ('deadline_on_multiplier',       1.0,  'On-Time Completion',  'Multiplier when closed on due date',            'deadline'),
  ('deadline_after_penalty_per_day', 0.1,'Late Penalty/Day',    'Points deducted per day past due date',         'deadline');
```

### 3.3 Alter `tasks` Table (Migration 019)

```sql
-- Add new classification columns
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS task_type   "Marketing-PM-Tool".task_type_enum,
  ADD COLUMN IF NOT EXISTS complexity  "Marketing-PM-Tool".complexity_enum;

-- Change score_weight from int to numeric to hold decimal scores
ALTER TABLE "Marketing-PM-Tool".tasks
  ALTER COLUMN score_weight TYPE numeric(6,2) USING score_weight::numeric(6,2),
  ALTER COLUMN score_weight SET DEFAULT 0;

ALTER TABLE "Marketing-PM-Tool".tasks
  ALTER COLUMN score_earned TYPE numeric(6,2) USING score_earned::numeric(6,2),
  ALTER COLUMN score_earned SET DEFAULT 0;
```

### 3.4 Scoring Trigger (Migration 019)

Runs on every INSERT and UPDATE on `tasks`. Reads live values from `point_config` so admin changes take effect on future saves immediately.

```sql
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".auto_calculate_task_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type_weight          numeric(6,2) := 1.0;
  v_complexity_weight    numeric(6,2) := 1.0;
  v_potential            numeric(6,2) := 0;
  v_before_mult          numeric(6,2) := 1.5;
  v_on_mult              numeric(6,2) := 1.0;
  v_late_penalty         numeric(6,2) := 0.1;
  v_days_late            int;
BEGIN
  -- Only auto-calculate if task_type and complexity are set
  IF NEW.task_type IS NOT NULL AND NEW.complexity IS NOT NULL THEN

    -- Load weights from point_config
    SELECT config_value INTO v_type_weight
    FROM "Marketing-PM-Tool".point_config
    WHERE config_key = 'task_type_' || NEW.task_type::text;

    SELECT config_value INTO v_complexity_weight
    FROM "Marketing-PM-Tool".point_config
    WHERE config_key = 'complexity_' || NEW.complexity::text;

    SELECT config_value INTO v_before_mult
    FROM "Marketing-PM-Tool".point_config
    WHERE config_key = 'deadline_before_multiplier';

    SELECT config_value INTO v_on_mult
    FROM "Marketing-PM-Tool".point_config
    WHERE config_key = 'deadline_on_multiplier';

    SELECT config_value INTO v_late_penalty
    FROM "Marketing-PM-Tool".point_config
    WHERE config_key = 'deadline_after_penalty_per_day';

    v_potential := ROUND(
      COALESCE(v_type_weight, 1.0) * COALESCE(v_complexity_weight, 1.0),
      2
    );
    NEW.score_weight := v_potential;

    -- Calculate earned score only when status = 'done'
    IF NEW.status = 'done' THEN
      IF NEW.due_date IS NULL OR NEW.completion_date IS NULL THEN
        -- No deadline: award on-time score
        NEW.score_earned := ROUND(v_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSIF NEW.completion_date < NEW.due_date THEN
        NEW.score_earned := ROUND(v_potential * COALESCE(v_before_mult, 1.5), 2);
      ELSIF NEW.completion_date = NEW.due_date THEN
        NEW.score_earned := ROUND(v_potential * COALESCE(v_on_mult, 1.0), 2);
      ELSE
        v_days_late := (NEW.completion_date - NEW.due_date)::int;
        NEW.score_earned := GREATEST(
          0,
          ROUND(v_potential - COALESCE(v_late_penalty, 0.1) * v_days_late, 2)
        );
      END IF;
    ELSE
      -- Not done: earned stays 0
      NEW.score_earned := 0;
    END IF;

  ELSE
    -- No type/complexity set: zero out scores
    NEW.score_weight := 0;
    NEW.score_earned := 0;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_auto_score
  BEFORE INSERT OR UPDATE ON "Marketing-PM-Tool".tasks
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".auto_calculate_task_score();
```

### 3.5 RLS for `point_config`

```sql
ALTER TABLE "Marketing-PM-Tool".point_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config (needed to preview scores in UI)
CREATE POLICY "point_config_read" ON "Marketing-PM-Tool".point_config
  FOR SELECT TO authenticated USING (true);

-- Only admins can write
CREATE POLICY "point_config_admin_write" ON "Marketing-PM-Tool".point_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

GRANT SELECT ON "Marketing-PM-Tool".point_config TO authenticated;
GRANT ALL    ON "Marketing-PM-Tool".point_config TO service_role;
```

---

## 4. API Changes

### 4.1 Remove `score_weight` / `score_earned` from user-writable fields

In `app/api/tasks/route.ts` and `app/api/tasks/[id]/route.ts`:
- Strip `score_weight` and `score_earned` from the Zod schemas (POST and PATCH)
- These fields must never be accepted from client payloads — the trigger sets them
- When marking a task `done`, the API must set `completion_date = today` if not already set, so the trigger can compute the deadline delta

### 4.2 New API: `GET /api/point-config`

Returns all rows from `point_config`. Used by the task creation form to render the live preview.

```ts
// Returns:
[
  { config_key: 'task_type_ai', config_value: 1.5, label: 'AI', category: 'task_type' },
  ...
]
```

### 4.3 New API: `PATCH /api/admin/point-config`

Admin-only. Updates one or more config values.

```ts
// Body:
{ updates: [{ config_key: string, config_value: number }] }
// Returns: updated rows
```

---

## 5. TypeScript Type Changes

```ts
// types/index.ts additions

export type TaskType = 'monthly_task' | 'new_implementation' | 'ai'
export type Complexity = 'easy' | 'medium' | 'difficult'

// Update Task interface:
export interface Task {
  // ... existing fields ...
  task_type: TaskType | null      // new
  complexity: Complexity | null   // new
  score_weight: number            // now numeric (auto-calculated potential)
  score_earned: number            // now numeric (auto-calculated earned)
  // score_weight and score_earned are READ-ONLY from the client's perspective
}

export interface PointConfig {
  id: string
  config_key: string
  config_value: number
  label: string
  description: string | null
  category: 'task_type' | 'complexity' | 'deadline'
  updated_by: string | null
  updated_at: string
}
```

---

## 6. UI Changes

### 6.1 Task Creation Form

Add two new required dropdowns before the form can be submitted:

**Task Type** (radio or select):
- 🔁 Monthly Task — 0.5×
- 🚀 New Implementation — 1.0×
- 🤖 AI — 1.5×

**Complexity** (radio or select):
- 🟢 Easy — 0.5×
- 🟡 Medium — 1.0×
- 🔴 Difficult — 1.5×

**Live Points Preview** (shown as soon as both are selected):
```
Potential Score: 1.50 pts
(closed early → up to 2.25 pts · closed late → may be lower)
```

### 6.2 Task Card / Table Row

Show two badges when task has type + complexity set:

- Before close: `[ ⚡ 1.50 pts potential ]`
- After close (done): `[ ✓ 1.50 pts earned ]` (green) or `[ ✓ 0.80 pts earned ]` (amber, if late)

### 6.3 Task Detail Drawer / Modal

Add a "Scoring Breakdown" section:

```
Task Type:    New Implementation   ×1.0
Complexity:   Difficult            ×1.5
──────────────────────────────────────
Potential:                         1.50 pts

Deadline:     Apr 28, 2026
Closed:       Apr 25, 2026  (3 days early)
Multiplier:   ×1.5 (Early Completion)
──────────────────────────────────────
Earned:                            2.25 pts
```

### 6.4 Admin: Points Configuration Page

New page at `/admin/settings` (or tab within existing admin layout):

- Table listing all 9 config entries grouped by category
- Inline numeric inputs with 2 decimal precision
- "Save Changes" button (calls `PATCH /api/admin/point-config`)
- Live example matrix showing resulting scores at current weights:

| | Easy | Medium | Difficult |
|---|---|---|---|
| Monthly Task | 0.25 | 0.50 | 0.75 |
| New Impl | 0.50 | 1.00 | 1.50 |
| AI | 0.75 | 1.50 | 2.25 |

---

## 7. Behavior Rules

| Rule | Detail |
|------|--------|
| Points are system-controlled | Users cannot set `score_weight` or `score_earned` — form fields must not expose them |
| Retroactive safety | Changing `point_config` does NOT retroactively recalculate closed tasks. Only new saves (INSERT/UPDATE) trigger recalculation |
| Re-open reset | If a task is re-opened (status changes from `done` → anything else), `score_earned` is reset to 0 by the trigger |
| No type/complexity → zero | Tasks without both fields set earn 0 pts and show no scoring badge |
| Completion date auto-set | When the API receives `status: done`, it sets `completion_date = CURRENT_DATE` if the field is null. The trigger uses this date for deadline math |
| Draft tasks | Draft tasks (`is_draft = true`) follow the same scoring rules but are excluded from monthly score rollups until committed |

---

## 8. Implementation Order

1. **Migration 019** — Add enums, alter `tasks` columns, create `point_config` table, seed defaults, add trigger
2. **API layer** — Strip score fields from writable schemas; add `/api/point-config` (GET) and `/api/admin/point-config` (PATCH); add `completion_date` auto-set on close
3. **TypeScript types** — Add `TaskType`, `Complexity`, update `Task` and add `PointConfig`
4. **Task form** — Task Type + Complexity dropdowns, live potential preview
5. **Task card/drawer** — Scoring badges and breakdown section
6. **Admin settings page** — Point config table with inline edit and live matrix preview
