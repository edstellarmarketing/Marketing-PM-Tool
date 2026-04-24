# Audit v2 — Automated Points System: Full Impact Assessment

**Date:** 2026-04-20  
**Scope:** Every page, component, API route, and DB function that touches scoring after the new automated task points system was introduced.

---

## What Changed (Reference)

| Area | Before | After |
|------|--------|-------|
| `score_weight` | User-editable integer (default 10) | Auto-calculated: `task_type_weight × complexity_weight` (numeric 6,2) |
| `score_earned` | User/admin-editable integer | Auto-calculated on close: potential × deadline_multiplier |
| New columns | — | `task_type` (enum), `complexity` (enum) |
| New table | — | `point_config` (admin-editable weights) |
| Score range | 1–100 int | 0.25–3.375 decimal (before early bonus: up to ~5.06) |

---

## Phase 1 — Critical: Data Corruption / Security Holes

These issues allow users to bypass the automated system or cause silent data loss.

---

### 1.1 Manual score_weight input in Task Edit page

**File:** `app/(app)/tasks/[id]/edit/page.tsx`  
**Lines:** 288–298  
**Severity:** 🔴 Critical

The full edit page for an existing task still renders a numeric input for `score_weight` and sends it to the API. Although the PATCH schema now strips `score_weight`, the field is still in the local form state (initialised from `data.score_weight`, line 53) and displayed to the user — this is misleading and confusing.

```tsx
// BROKEN — lines 288–298
<div className="w-1/2 pr-2">
  <label>Score Weight (pts)</label>
  <input
    type="number"
    min={1} max={100}
    value={form.score_weight}
    onChange={e => setField('score_weight', parseInt(e.target.value) || 10)}
  />
</div>
```

Also missing: `task_type` and `complexity` selectors. These are the inputs that actually drive the score — without them, users editing existing tasks cannot set or change the classification.

**Fix:**
- Remove `score_weight` from form state and the input field.
- Add `task_type` + `complexity` card selectors (same pattern as `tasks/new/page.tsx`).
- Fetch `/api/point-config` on mount and show the live potential score preview.
- Show read-only score badges (current potential / earned) as in `EditTaskModal`.

---

### 1.2 TaskSubtasks sends score_earned to the API

**File:** `components/tasks/TaskSubtasks.tsx`  
**Line:** 46  
**Severity:** 🔴 Critical

When a user checks a sub-task checkbox, `TaskSubtasks` calculates a proportional `score_earned` client-side and sends it in the PATCH body:

```tsx
body: JSON.stringify({ subtasks: updated, score_earned: newEarned })
```

Two problems:
1. **Security:** The PATCH schema was updated to strip `score_earned`, so this field is silently ignored — but it still implies users can control their own earned score.
2. **Logic conflict:** The DB trigger recalculates `score_earned` on every UPDATE (including this one), so even if the value were accepted it would be immediately overwritten by the trigger. The client computation is now dead code that misleads the reader.

Additionally, `computeEarned()` on line 26–29 uses integer math (`Math.round`) and references `scoreWeight` as an integer — both wrong for decimal scores:

```tsx
function computeEarned(updated: SubTask[]) {
  const completedCount = updated.filter(s => s.completed).length
  return total > 0 ? Math.round((completedCount / total) * scoreWeight) : 0
}
```

**Fix:**
- Remove `score_earned` from the PATCH payload entirely.
- Remove `computeEarned()`, `scoreEarned` state, and `initialScoreEarned` prop.
- Remove the `{scoreEarned}/{scoreWeight} pts` display badge — subtask completion no longer drives points directly.
- Show a simpler `{done}/{total} subtasks` badge only.
- The score displayed on the task detail page will update after the parent page re-fetches (triggered by router.refresh or revalidation).

---

### 1.3 monthly_scores trigger uses INT variables — truncates decimal scores

**File:** `supabase/migrations/012_realtime_scores.sql`  
**Lines:** 5–8  
**Severity:** 🔴 Critical

The `update_user_monthly_score` function declares its accumulator variables as `int`:

```sql
DECLARE
  v_total int;
  v_completed int;
  v_score_earned int;      -- ← truncates decimal score_earned values
  v_score_possible int;    -- ← truncates decimal score_weight values
```

Since `tasks.score_weight` and `tasks.score_earned` are now `numeric(6,2)`, when the trigger sums them and assigns the result to these `int` variables, all decimal parts are silently truncated (e.g. 2.25 becomes 2, 1.50 becomes 1). The monthly leaderboard, performance charts, and appraisal totals all read from `monthly_scores` — so every downstream view shows wrong data.

Also, `monthly_scores.score_earned` and `monthly_scores.score_possible` are still `int` columns in the DB (defined in `001_create_schema_and_tables.sql` line 68–69).

**Fix — SQL migration needed:**
```sql
-- Alter monthly_scores columns to hold decimals
ALTER TABLE "Marketing-PM-Tool".monthly_scores
  ALTER COLUMN score_earned  TYPE numeric(8,2) USING score_earned::numeric(8,2),
  ALTER COLUMN score_possible TYPE numeric(8,2) USING score_possible::numeric(8,2);

-- Fix the function variable types
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".update_user_monthly_score(...)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total        int;
  v_completed    int;
  v_score_earned    numeric(8,2);   -- was int
  v_score_possible  numeric(8,2);   -- was int
  ...
```

---

### 1.4 appraisal_snapshots.total_score and avg_monthly_score — type mismatch

**File:** `supabase/migrations/001_create_schema_and_tables.sql` and `004_appraisal_publish.sql`  
**Severity:** 🔴 Critical

`appraisal_snapshots.total_score` is `int NOT NULL DEFAULT 0`. The appraisal generation API inserts `total_score` as the sum of monthly scores — which are now decimal. Silent truncation again.

**Fix:**
```sql
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots
  ALTER COLUMN total_score TYPE numeric(8,2) USING total_score::numeric(8,2);
```

---

## Phase 2 — Important: Wrong Displays and Broken UX

These issues don't corrupt data but show users incorrect or outdated information.

---

### 2.1 TaskListClient shows raw integer score fraction

**File:** `components/tasks/TaskListClient.tsx`  
**Lines:** 284–287  
**Severity:** 🟠 High

The task list table renders the score as a raw `earned/possible` fraction:

```tsx
<span className={task.score_earned > 0 ? 'text-green-600 font-medium' : ''}>
  {task.score_earned}
</span>
<span className="text-gray-400">/{task.score_weight}</span>
```

This was designed for integers like `7/10`. With decimals it shows `1.5/2.25` with no context — no unit, no label, no "potential" vs "earned" distinction, no task_type or complexity badge.

**Fix:** Replace with the same score badge pattern from `TaskCard.tsx` — show `⚡ X pts potential` or `⚡ X pts earned` with the green/blue colour coding.

---

### 2.2 Task detail page shows raw score without context

**File:** `app/(app)/tasks/[id]/page.tsx`  
**Line:** 116  
**Severity:** 🟠 High

```tsx
<p className="text-sm font-medium text-gray-700">{task.score_earned} / {task.score_weight} pts</p>
```

Missing:
- No `task_type` or `complexity` display (user can't see what classification drove the score).
- No deadline context (was it early, on time, or late?).
- Score fraction makes no sense without knowing the multiplier.

**Fix:** Expand the Score section into a Scoring Breakdown card:
```
Task Type:   🤖 AI              × 1.5
Complexity:  🔴 Difficult       × 1.5
─────────────────────────────────────
Potential:                      2.25 pts

Due:         Apr 25, 2026
Closed:      Apr 22, 2026  (3 days early)
Multiplier:  × 1.5 (Early)
─────────────────────────────────────
Earned:                         3.38 pts
```

Also show `task_type` and `complexity` as read-only badges in the metadata section.

---

### 2.3 PlanningTable shows raw score_weight number with no label

**File:** `components/plans/PlanningTable.tsx`  
**Line:** 107  
**Severity:** 🟡 Medium

```tsx
<span className="text-sm font-medium text-gray-600">{task.score_weight}</span>
```

The number `0` (for tasks with no type/complexity set) or `2.25` renders with no unit or context. For draft tasks that haven't been classified yet, `0` is misleading.

**Fix:** Show `—` when `score_weight === 0`, otherwise show `{score_weight} pts` with the ⚡ icon. Consider adding `task_type` + `complexity` as small badges in the planning table row.

---

### 2.4 "Most Improved" badge threshold is meaningless at new scale

**File:** `lib/scoring.ts`  
**Line:** 37  
**Severity:** 🟡 Medium

```ts
const hasMostImproved = maxImprovement >= 20
```

With the old integer scale (0–100+), a 20-point jump was meaningful. With the new decimal scale, the maximum possible monthly score is roughly `2.25 × 1.5 × N` where N is the number of tasks. A single team member doing 10 AI+Difficult tasks closed early earns ~33.75 pts/month — a 20-point month-over-month improvement is very easy.

More importantly, `monthly_scores.score_earned` is now the sum of earned points across all tasks per month. The threshold needs to be reconsidered relative to typical team output.

**Fix options:**
- Change threshold to a percentage improvement (e.g. 50% increase month-over-month).
- Make it admin-configurable via `point_config` (add a `badge_most_improved_threshold` key).
- For now, lower to `0.5` to be meaningful on the decimal scale while a better formula is designed.

---

### 2.5 Performance page — top tasks list shows raw score_earned without unit

**File:** `app/(app)/performance/page.tsx`  
**Line:** 379  
**Severity:** 🟡 Medium

```tsx
{task.score_earned} pts
```

This displays correctly as a number but:
- No `task_type` or `complexity` badge alongside it, so the user can't understand *why* a task scored what it scored.
- The top-5 tasks list has no classification context.

**Fix:** Add `task_type` and `complexity` as small inline badges in the top tasks table rows.

---

### 2.6 Admin pending approvals panel — no task classification shown

**File:** `components/admin/PendingApprovalsPanel.tsx`  
**Severity:** 🟡 Medium

The approvals panel shows task title, user, due date and priority — but not `task_type` or `complexity`. Admins cannot see what classification was chosen and therefore cannot verify the score will be appropriate when approved.

**Fix:** Add `task_type` and `complexity` badges to each pending task row.

---

### 2.7 Appraisal report — PrintableAppraisal missing task_type/complexity breakdown

**File:** `components/appraisals/PrintableAppraisal.tsx`  
**Severity:** 🟡 Medium

The report currently shows:
- Monthly performance bar chart
- Category (SEO, Content, etc.) completion bars
- AI-generated summary, strengths, growth areas, roadmap

It does NOT show:
- Distribution of tasks by `task_type` (how many Monthly vs New Implementation vs AI)
- Distribution by `complexity` (Easy / Medium / Difficult)
- Score earned vs potential with deadline context
- Whether the member consistently closes early, on time, or late

The appraisal AI prompt also does not receive task_type or complexity distribution data — so the "Development Roadmap" can't make recommendations like "focus on higher-complexity AI tasks next FY".

**Fix:** 
1. Add a `get_annual_task_classification_stats` RPC that returns task_type and complexity distributions for the FY.
2. Pass this data to the appraisal generation API (include in the AI prompt).
3. Add a "Task Classification" section to `PrintableAppraisal` showing:
   - Task type distribution bar
   - Complexity distribution bar
   - Avg score per task type

---

### 2.8 Appraisal generation API — total_score is wrong type

**File:** `app/api/appraisals/[userId]/route.ts`  
**Line:** 103–111  
**Severity:** 🟠 High

```ts
const { data: snapshot, error: insertError } = await supabase
  .from('appraisal_snapshots')
  .upsert({
    ...
    total_score: totalScore,       // sum of monthly score_earned (will be decimal)
    avg_monthly_score: avgScore,   // average (decimal)
```

Once Phase 1.4 is fixed (column type changed to numeric), these values pass through correctly. But the line:

```ts
const totalScore = monthlyStats?.reduce((s: number, m: { score_earned: number }) => s + m.score_earned, 0) ?? 0
```

will receive `score_earned` values that are still `int` until Phase 1.3 and 1.4 are applied to the DB. The issue is ordering — Phase 1 DB fixes must be applied before Phase 2 display fixes are meaningful.

---

## Phase 3 — Enhancements: Completeness

These are not bugs but missing features that complete the system as designed.

---

### 3.1 No task_type/complexity filter in task list

**File:** `app/(app)/tasks/page.tsx` and `components/tasks/TaskListClient.tsx`  
**Severity:** ⚪ Enhancement

The task list currently filters by status, priority, and category. With the new classification system, users should be able to filter by `task_type` and `complexity` to review all their AI tasks or all Difficult tasks.

**Fix:** Add `task_type` and `complexity` as optional filters in `GET /api/tasks` and the filter bar UI.

---

### 3.2 Dashboard should show scoring classification breakdown

**File:** `app/(app)/dashboard/page.tsx`  
**Severity:** ⚪ Enhancement

The dashboard shows this month's score total and completion rate. It should also show:
- Tasks by type (🔁 / 🚀 / 🤖 counts)
- Score breakdown by type
- Early / On-time / Late close ratio for the current month

---

### 3.3 point_config changes don't retroactively recalculate open tasks

**File:** `app/api/admin/point-config/route.ts`  
**Severity:** ⚪ Enhancement (documented behaviour)

When an admin changes weights (e.g. increases AI weight from 1.5 to 2.0), existing open tasks do NOT update their `score_weight` until the task itself is next saved (INSERT or UPDATE). The trigger only fires on task writes.

**Fix:** Add a "Recalculate all open tasks" button to the admin settings page that calls a new `POST /api/admin/point-config/recalculate` endpoint. This endpoint runs:
```sql
UPDATE "Marketing-PM-Tool".tasks
SET updated_at = now()
WHERE status != 'done'
  AND task_type IS NOT NULL
  AND complexity IS NOT NULL;
```
The UPDATE fires the trigger for each open task, refreshing `score_weight`.

---

### 3.4 No score breakdown on the leaderboard

**File:** `app/(app)/leaderboard/page.tsx`  
**Severity:** ⚪ Enhancement

Leaderboard shows total `score_earned` and `completion_rate`. Members cannot see how they earned their score (which task types, which complexity levels). Adding a mini breakdown tooltip or detail row would improve transparency and motivation.

---

### 3.5 AI suggestion panel sends score_weight suggestion — now ignored

**File:** `components/ai/TaskSuggestionPanel.tsx`  
**Severity:** ⚪ Minor

The AI panel suggests tasks with a `score_weight` value that is imported via `importSuggestion()`. In `tasks/new/page.tsx`, the old `importSuggestion` accepted `score_weight` and set it on the form. The new form no longer has a `score_weight` field, so this value is silently dropped. The AI should suggest `task_type` and `complexity` instead.

**Fix:** Update the AI prompt in `TaskSuggestionPanel` to return `task_type` and `complexity` in the suggestion JSON instead of `score_weight`. Update `importSuggestion` to set the classification fields.

---

## Summary Table

| # | File | Issue | Phase | Severity |
|---|------|-------|-------|----------|
| 1.1 | `tasks/[id]/edit/page.tsx` | Manual score_weight input + missing task_type/complexity | 1 | 🔴 Critical |
| 1.2 | `components/tasks/TaskSubtasks.tsx` | Sends score_earned to API; dead computeEarned logic | 1 | 🔴 Critical |
| 1.3 | `supabase/migrations/012_realtime_scores.sql` | INT variables truncate decimal scores in monthly rollup | 1 | 🔴 Critical |
| 1.4 | `appraisal_snapshots.total_score` column | INT column truncates decimal total_score | 1 | 🔴 Critical |
| 2.1 | `components/tasks/TaskListClient.tsx` | Raw fraction display, no badge, no labels | 2 | 🟠 High |
| 2.2 | `app/(app)/tasks/[id]/page.tsx` | No task_type/complexity shown; raw score fraction | 2 | 🟠 High |
| 2.3 | `components/plans/PlanningTable.tsx` | Raw score_weight number with no label or context | 2 | 🟡 Medium |
| 2.4 | `lib/scoring.ts` | Most Improved badge threshold (20 pts) wrong at decimal scale | 2 | 🟡 Medium |
| 2.5 | `app/(app)/performance/page.tsx` | Top tasks list missing type/complexity badges | 2 | 🟡 Medium |
| 2.6 | `components/admin/PendingApprovalsPanel.tsx` | No task_type/complexity visible in approval queue | 2 | 🟡 Medium |
| 2.7 | `components/appraisals/PrintableAppraisal.tsx` | No task classification breakdown in report | 2 | 🟡 Medium |
| 2.8 | `app/api/appraisals/[userId]/route.ts` | Depends on Phase 1 DB fixes being applied first | 2 | 🟠 High |
| 3.1 | `TaskListClient.tsx` + `/api/tasks` | No task_type/complexity filter | 3 | ⚪ Enhancement |
| 3.2 | `dashboard/page.tsx` | No classification breakdown widget | 3 | ⚪ Enhancement |
| 3.3 | `admin/point-config/route.ts` | No bulk recalculate for open tasks on config change | 3 | ⚪ Enhancement |
| 3.4 | `leaderboard/page.tsx` | No score breakdown per type on leaderboard | 3 | ⚪ Enhancement |
| 3.5 | `components/ai/TaskSuggestionPanel.tsx` | AI suggests score_weight instead of task_type/complexity | 3 | ⚪ Minor |

---

## Execution Order

```
Phase 1 (run first — fixes silent data corruption)
  → 1.3  SQL: ALTER monthly_scores columns to numeric(8,2)
  → 1.3  SQL: Fix update_user_monthly_score() variable types
  → 1.4  SQL: ALTER appraisal_snapshots.total_score to numeric(8,2)
  → 1.1  Code: Rewrite tasks/[id]/edit/page.tsx
  → 1.2  Code: Fix TaskSubtasks.tsx

Phase 2 (display correctness — depends on Phase 1 DB being live)
  → 2.1  Code: Update TaskListClient score display
  → 2.2  Code: Expand task detail score section
  → 2.3  Code: Fix PlanningTable score display
  → 2.4  Code: Fix scoring.ts badge threshold
  → 2.5  Code: Add badges to performance top tasks
  → 2.6  Code: Add badges to PendingApprovalsPanel
  → 2.7  Code: Add classification section to PrintableAppraisal
  → 2.8  Verify: Appraisal API works correctly after DB fixes

Phase 3 (enhancements — independent of Phase 1/2)
  → 3.1  Task list filtering by type/complexity
  → 3.2  Dashboard classification widget
  → 3.3  Admin bulk recalculate button
  → 3.4  Leaderboard score breakdown
  → 3.5  AI suggestion panel update
```
