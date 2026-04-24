# Member Daily Summary Email — Implementation Plan

## Overview

Redesign the existing Member Daily Digest (currently 9:00 AM IST) to send at **7:00 AM IST** and restructure its content to mirror the 4-section layout introduced in the Admin Daily Task Summary email.

---

## Schedule Change

| Setting | Current | New |
|---------|---------|-----|
| Cron (UTC) | `30 3 * * *` | `30 1 * * *` |
| Time (IST) | 9:00 AM | 7:00 AM |
| File | `vercel.json` | same |
| DB `send_time` | `09:00` | `07:00` |

Update in two places:
1. `vercel.json` — change `"30 3 * * *"` to `"30 1 * * *"`
2. Supabase `email_settings` row where `key = 'member_daily_digest'` — set `send_time = '07:00'`
3. Fallback default in `app/(app)/admin/email-settings/page.tsx` — `'09:00'` → `'07:00'`

---

## Email Sections (4 total)

The email is **personalised per member** — every section filters data for that specific user only.

---

### Section 1 — My Active Tasks Due Today
**Accent colour: Blue (`#2563eb`)**

Show all tasks assigned to this member that are due today and have **not** been marked done.

**Table columns:** Task (linked) | Priority badge | Category | Score (pts)

**Empty state:** "You have no tasks due today — great start! 🎉"

**DB query (already exists in cron):**
```sql
SELECT id, title, priority, category, score_weight, status, due_date, user_id
FROM tasks
WHERE user_id = <memberId>
  AND due_date = <today_IST>
  AND status != 'done'
  AND is_draft = false
  AND parent_task_id IS NULL
```

---

### Section 2 — Missed Yesterday — Still Not Done
**Accent colour: Red (`#dc2626`)**

Tasks due **yesterday** (only yesterday, not all historic overdue) that are still not completed. This mirrors the admin email's "Missed Yesterday" section but scoped to the individual member.

> **Why only yesterday?** The full overdue list already exists in the app dashboard. The morning email should surface the most urgent new miss — what slipped overnight — without overwhelming the member with a long backlog list.

**Table columns:** Task (linked) | Priority badge | Category | Score at risk (pts)

**Empty state:** "Nothing missed yesterday — keep it up!"

**DB query (new — currently the cron fetches ALL overdue, need to narrow to yesterday only):**
```sql
SELECT id, title, priority, category, score_weight, status, due_date, user_id
FROM tasks
WHERE user_id = <memberId>
  AND due_date = <yesterday_IST>
  AND status != 'done'
  AND is_draft = false
  AND parent_task_id IS NULL
```

**Code change required:** In `app/api/cron/member-daily-digest/route.ts`, the current `overdueAll` query uses `lt('due_date', todayDate)` which fetches all historic overdue tasks. Change it to `eq('due_date', yesterdayDate)` to match the admin email pattern.

Similarly update the batch query in the test route (`app/api/admin/email-settings/test/route.ts`).

---

### Section 3 — My Monthly Progress
**Accent colour: Slate (`#475569`)**

A single summary row showing this member's task completion rate for the current calendar month (1st of month to today).

**Table columns:** Month label | Total Tasks | Completed | Pending

**Empty state:** "No tasks scheduled for you this month."

**DB query (new — not in current cron):**
```sql
SELECT id, status
FROM tasks
WHERE user_id = <memberId>
  AND due_date >= <first_of_month_IST>
  AND due_date <= <today_IST>
  AND is_draft = false
  AND parent_task_id IS NULL
```

Compute `total`, `done` (status = 'done'), `pending` (status != 'done') in application code.

**Code change required:** Add this query to the parallel batch in `member-daily-digest/route.ts`. Since all member data is fetched in one batch and then filtered per member, add a fifth parallel query:

```typescript
admin.from('tasks')
  .select('id, status, user_id')
  .in('user_id', memberIds)
  .gte('due_date', firstOfMonth)
  .lte('due_date', todayDate)
  .eq('is_draft', false)
  .is('parent_task_id', null)
```

Then for each member, filter and compute stats.

---

### Section 4 — Pending Approvals I Need to Give
**Accent colour: Amber (`#d97706`)**

Tasks that this member **assigned to others as dependencies** which have been completed (status = 'done', approval_status = 'pending_approval') and are now waiting for the member to approve. This is identical in concept to the admin's pending approvals section but for member-assigned dependencies.

**Table columns:** Task (linked) | Priority badge | Completed by (assignee name + designation) | Score (pts)

**Empty state:** "No approvals waiting for you. ✅"

**DB query (already exists in cron as `pendingApprovalsAll`):**
```sql
SELECT id, title, priority, score_weight, status, user_id, assigned_by
FROM tasks
WHERE assigned_by = <memberId>
  AND approval_status = 'pending_approval'
  AND status = 'done'
  AND is_draft = false
```

No query change needed — the data is already fetched. Only the template rendering changes.

---

## Stats Bar (top of email)

Four numbers displayed in a horizontal row, mirroring the admin email stats bar:

| Stat | Value | Colour |
|------|-------|--------|
| Due Today | count of section 1 tasks | Blue |
| Missed Yesterday | count of section 2 tasks | Red |
| Monthly Done / Total | e.g. `8 / 12` | Slate |
| Approvals Pending | count of section 4 tasks | Amber |

---

## What Stays the Same

- The "Approvals received yesterday" sections (approved by peer, approved by admin) from the current digest are **removed** from the 7 AM email. Those are backward-looking and better suited for an end-of-day digest if needed later. The morning email should be purely forward-looking (what do I need to do today?).
- Email is still **skipped for a member if all 4 sections are empty** — no noise.
- Email is still gated by `member_daily_digest.enabled` in the `email_settings` table.
- One email per member sent individually.

---

## Files to Change

| File | Change |
|------|--------|
| `vercel.json` | Cron schedule `30 3 * * *` → `30 1 * * *` |
| `app/api/cron/member-daily-digest/route.ts` | Add monthly query; change overdue query to yesterday-only; pass new data to template |
| `lib/email.ts` | Replace `memberDailyDigestEmailHtml` with new 4-section layout matching admin email style; update `MemberDailyDigestOptions` interface |
| `app/api/admin/email-settings/test/route.ts` | Update admin test block to use new query + new template call |
| `app/(app)/admin/email-settings/page.tsx` | Update fallback `send_time` from `'09:00'` to `'07:00'` and update description text |
| Supabase DB | PATCH `email_settings` set `send_time = '07:00'` where `key = 'member_daily_digest'` |

---

## No Migration Required

All data comes from the existing `tasks` and `profiles` tables. No new columns or tables needed.

---

## Email Layout Sketch

```
┌─────────────────────────────────────────────┐
│ Edstellar · Marketing PM                    │  (dark slate header)
│ Your Daily Task Summary                     │
│ Thursday, 24 April 2026                     │
├──────────┬──────────┬──────────┬────────────┤
│ 3        │ 1        │ 8/12     │ 2          │  (stats bar)
│ Due Today│ Missed   │ Monthly  │ Pending    │
│          │Yesterday │ Done     │ Approvals  │
├─────────────────────────────────────────────┤
│ 📋 MY ACTIVE TASKS DUE TODAY (3)           │  blue header
│  Task A           medium    2 pts           │
│  Task B           high      5 pts           │
│  Task C           low       1 pt            │
├─────────────────────────────────────────────┤
│ ⚠️ MISSED YESTERDAY — STILL NOT DONE (1)  │  red header
│  Task D           critical  8 pts at risk   │
├─────────────────────────────────────────────┤
│ 📊 MY MONTHLY PROGRESS — April 2026        │  slate header
│  Total: 12  |  Completed: 8  |  Pending: 4 │
├─────────────────────────────────────────────┤
│ 🔔 PENDING APPROVALS I NEED TO GIVE (2)   │  amber header
│  Task E    high   Completed by Riya S.      │
│  Task F    medium Completed by Arjun K.     │
├─────────────────────────────────────────────┤
│           [ Open My Dashboard → ]           │
└─────────────────────────────────────────────┘
```
