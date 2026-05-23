# Announcements — Feature Plan

A lightweight "post a work item to a department" channel. Admins publish a target
(e.g. "Improve Edstellar blog category traffic from 100 → 300 clicks by 2026-06-30")
tagged to a department. Members of that department see it on their dashboard and
on a new Announcements page, and the first one to accept turns it into a real task
on their own list with the due date locked in.

---

## 1. Behaviour

### Admin
- Create an announcement scoped to **one or more departments**, with: title,
  description, due date, priority, optionally task_type / complexity / category.
  An announcement is visible to every member whose `profiles.department` is in
  the tagged set.
- See a list of all announcements on a new Admin Announcements page with status:
  - **open** — nobody has accepted yet.
  - **active** — a member has accepted; the resulting task is linked.
- Can delete an announcement at any time.
- Cannot edit core fields (title/description/due_date/department) once a member
  has accepted — the announcement is the contract for the task they created.
  Pre-acceptance edits are allowed.
- Unaccepted (`open`) announcements **auto-delete 30 days** after creation via a
  daily cron job.

### Member
- See announcements **for their own department** only:
  - As a compact widget on `/dashboard` (top-of-page).
  - On a new dedicated `/announcements` page.
- "Accept" an open announcement → creates a task on their list with all the
  announcement fields pre-filled, including a due date that **cannot be edited**.
  The announcement flips to `active` and stays linked to the task.
- Once active, the announcement is shown but no longer accept-able by others
  (first-accept-wins; see open question Q1 if multi-accept is preferred).

### Attachments — two-way proof channel

- **Admin → members (announcement attachments):** when creating an
  announcement, the admin can attach one or more **screenshots** (PNG / JPG /
  WEBP / GIF, ≤ 5 MB each, up to 5 per announcement) as reference material —
  e.g. the current analytics view they want improved. Everyone in the target
  department sees these screenshots on the announcement card, the dashboard
  widget, and the accept confirmation modal.
- **Members → admin (task attachments):** on the task that was created from
  the accepted announcement, the member can attach proof-of-success
  screenshots (same format limits) at any time before approval. The admin
  reviewing the task sees them in the existing pending-approval flow.
- Task-attachments are **not** announcement-specific — we wire it on the
  `tasks` table directly so the same proof channel can be reused later for any
  task. Announcement-attachments stay scoped to the announcement.

---

## 1.5. Roles & Permissions (Hard Rules)

These are non-negotiable. Every layer (RLS, API, UI) enforces them.

| Action                                  | Admin | Non-admin (member)            |
|-----------------------------------------|-------|-------------------------------|
| Create announcement                     |  ✅   |  ❌                           |
| Edit announcement (title, dates, reward)|  ✅ (only while `open`) |  ❌             |
| Delete announcement                     |  ✅   |  ❌                           |
| Upload screenshots **on an announcement** |  ✅ (any time)        |  ❌                  |
| Delete screenshots on an announcement   |  ✅ (only their own uploads, or any if status=`open`) |  ❌ |
| View announcement screenshots           |  ✅ all              |  ✅ if announcement's department matches their own |
| View announcements list                 |  ✅ all departments | ✅ own department only |
| **Accept announcement** (creates a task)|  ❌ *(admins manage, they don't accept)* |  ✅ open ones in their dept |
| Upload screenshots **on a task** (proof) |  ✅ (any task)      |  ✅ only their own tasks    |
| Delete task screenshots                 |  ✅ (any)            |  ✅ only their own uploads, only before approval |
| View task screenshots                   |  ✅ all              |  ✅ task owner + assigner (`tasks.assigned_by`) |
| Change `due_date` on a task that was created from an announcement | ❌ | ❌ (date is locked for everyone) |
| Unlink an announcement-sourced task     |  ✅ (escape hatch — see Q3) |  ❌                  |

**What this means in practice:**

1. **Routes** — `/admin/announcements/*` (create / edit / list / detail) is
   served behind the existing admin-only redirect (matches the pattern used by
   `/admin/all-tasks`, `/admin/monthly-tasks`, etc.). Non-admins hitting any
   `/admin/announcements/...` URL are redirected to `/dashboard`.
2. **APIs** — anything that creates / updates / deletes announcement fields
   other than the accept transition lives under `/api/admin/announcements/*`
   and rejects non-admins with 403. The only mutation a non-admin can make is
   `POST /api/announcements/[id]/accept`, which serverside:
   - verifies role (any authenticated user with a matching department)
   - verifies announcement is still `open`
   - performs the open→active flip + task insert in a single transaction
   - returns 409 if someone else won the race
3. **RLS** — repeats the same constraints at the database level:
   - INSERT: `is_admin()` only
   - DELETE: `is_admin()` only
   - UPDATE (admin): allowed on any column **while status='open'**
   - UPDATE (non-admin): allowed *only* to set `status='active'`,
     `accepted_by=auth.uid()`, `accepted_at`, `accepted_task_id`; trigger
     rejects any update that touches other columns or that targets a row
     where `department != caller's profiles.department`.
4. **UI** — non-admins **never** see Edit, Delete, or "New Announcement"
   affordances anywhere. The only button on a member surface is **Accept**
   (and the Open task / See announcement links for their own active items).

This section is the source-of-truth — if a screen mockup or API description
elsewhere in this doc contradicts it, this section wins.

---

## 2. Data Model

### New enum
```sql
CREATE TYPE "Marketing-PM-Tool".announcement_status AS ENUM ('open', 'active');
```
(`expired` not modeled — expired rows are deleted by cron, not flagged.)

### New table: `announcements`
| column            | type                                | notes                                                          |
|-------------------|-------------------------------------|----------------------------------------------------------------|
| id                | uuid PK default gen_random_uuid()   |                                                                |
| title             | text NOT NULL                       | Becomes the task title on accept                               |
| description       | text                                | Becomes task description                                       |
| departments       | text[] NOT NULL CHECK (cardinality(departments) > 0) | One or more departments the announcement targets. Each entry matches `profiles.department` (free-text, no FK by convention). |
| due_date          | date NOT NULL                       | Locked onto the accepted task                                  |
| priority          | task_priority NOT NULL DEFAULT 'medium' | Reuses existing enum                                       |
| task_type         | text                                | Optional — copies to task if set                               |
| complexity        | text                                | Optional — copies to task if set                               |
| category          | text                                | Optional — copies to task if set                               |
| award_type_id     | uuid REFERENCES award_types(id) ON DELETE SET NULL | Award promised to whoever completes the resulting task. NULL means no award attached. |
| bonus_points      | int NOT NULL DEFAULT 0              | Bonus points granted on completion. Defaults to `award_types.bonus_points` when an award is selected, but admin can override (e.g. half-credit for a smaller version of the task). |
| score_weight      | int                                 | Optional task-points override. If set, the created task uses this as its `score_weight` instead of being auto-calculated from task_type × complexity. |
| status            | announcement_status NOT NULL DEFAULT 'open' |                                                        |
| accepted_by       | uuid REFERENCES profiles(id) ON DELETE SET NULL |                                                    |
| accepted_at       | timestamptz                         |                                                                |
| accepted_task_id  | uuid REFERENCES tasks(id) ON DELETE SET NULL    | Link to the resulting task                         |
| created_by        | uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE | Admin who created it                          |
| created_at        | timestamptz NOT NULL DEFAULT now()  |                                                                |
| updated_at        | timestamptz NOT NULL DEFAULT now()  |                                                                |
| expires_at        | timestamptz NOT NULL DEFAULT (now() + interval '30 days') | Set on insert; used by expiry cron       |

### Indexes
```sql
CREATE INDEX ON announcements USING GIN (departments);  -- supports `dept = ANY` lookups
CREATE INDEX ON announcements (status, expires_at);     -- supports expiry cron
CREATE INDEX ON announcements (accepted_by);            -- supports "my accepted"
```

### New table: `announcement_attachments`
Reference screenshots uploaded by the admin alongside the announcement.

| column           | type                                                    | notes                                          |
|------------------|---------------------------------------------------------|------------------------------------------------|
| id               | uuid PK default gen_random_uuid()                       |                                                |
| announcement_id  | uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE | Removing the announcement drops its files |
| storage_path     | text NOT NULL                                           | `announcement-attachments/{announcement_id}/{uuid}-{filename}` |
| file_name        | text NOT NULL                                           | Original filename for display                  |
| mime_type        | text NOT NULL                                           | Restricted to `image/png`, `image/jpeg`, `image/webp`, `image/gif` |
| size_bytes       | int NOT NULL                                            | App-enforced ≤ 5 MB (5_242_880)                |
| uploaded_by      | uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL |                                                |
| created_at       | timestamptz NOT NULL DEFAULT now()                      |                                                |

```sql
CREATE INDEX ON announcement_attachments (announcement_id);
```

### New table: `task_attachments`
Proof-of-success screenshots uploaded by the assignee (or admin) on a task.
Generic by design — not announcement-specific — so the same proof channel can
be reused for any task. Announcement-sourced tasks just happen to be the first
consumer.

| column         | type                                                  | notes                                       |
|----------------|-------------------------------------------------------|---------------------------------------------|
| id             | uuid PK default gen_random_uuid()                     |                                             |
| task_id        | uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE  | Drops files if task is deleted              |
| storage_path   | text NOT NULL                                         | `task-attachments/{task_id}/{uuid}-{filename}` |
| file_name      | text NOT NULL                                         |                                             |
| mime_type      | text NOT NULL                                         | Same image-only allowlist                   |
| size_bytes     | int NOT NULL                                          | ≤ 5 MB                                      |
| uploaded_by    | uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL |                                          |
| created_at     | timestamptz NOT NULL DEFAULT now()                    |                                             |

```sql
CREATE INDEX ON task_attachments (task_id);
CREATE INDEX ON task_attachments (uploaded_by);
```

### Storage buckets
Two new Supabase Storage buckets, both **private** (no public ACL):

| bucket                       | purpose                                  | path prefix             |
|------------------------------|------------------------------------------|-------------------------|
| `announcement-attachments`   | admin reference screenshots              | `{announcement_id}/...` |
| `task-attachments`           | member proof-of-success screenshots      | `{task_id}/...`         |

The app serves files via short-lived **signed URLs** (5 min TTL) from the
upload API endpoints — direct bucket access is denied to all clients.

### Trigger
- `updated_at` auto-bump via the existing `set_updated_at()` function (reused
  pattern, see `001_create_schema_and_tables.sql`).

### RLS
| operation | who                                                       |
|-----------|-----------------------------------------------------------|
| SELECT    | all authenticated; members are filtered by department in queries (not RLS) so admins can see everything |
| INSERT    | admins only (`is_admin()`)                                |
| UPDATE    | admins (any field on `open`); members can ONLY transition `open → active` when their `profile.department = ANY(announcements.departments)`, setting `accepted_by`, `accepted_at`, `accepted_task_id` |
| DELETE    | admins only                                               |

A `BEFORE UPDATE` trigger enforces the member's restricted update shape:
non-admins can only flip status `open → active` with `accepted_by = auth.uid()`
and cannot mutate any other column.

#### RLS — `announcement_attachments`
| operation | who                                                                |
|-----------|--------------------------------------------------------------------|
| SELECT    | admin, or member whose `profiles.department` matches the parent announcement's `department` |
| INSERT    | admins only (`is_admin()`)                                         |
| UPDATE    | nobody (rows are immutable; delete + re-upload to replace)         |
| DELETE    | admin who uploaded it, OR any admin if parent announcement is `open` |

#### RLS — `task_attachments`
| operation | who                                                                |
|-----------|--------------------------------------------------------------------|
| SELECT    | admin, or task owner (`tasks.user_id`), or assigner (`tasks.assigned_by`) |
| INSERT    | admin, or task owner — only if `tasks.approval_status != 'approved'` |
| UPDATE    | nobody (immutable rows)                                            |
| DELETE    | uploader (own row) — only if `tasks.approval_status != 'approved'`; admins can always delete |

#### Storage object policies
Mirror the table policies — Supabase storage object access is gated by the
same role + department + task-ownership predicates so a leaked URL still can't
be opened by an unauthorized session.

### Expiry function
```sql
CREATE FUNCTION expire_open_announcements() RETURNS int LANGUAGE plpgsql
  SECURITY DEFINER AS $$
DECLARE n int;
BEGIN
  DELETE FROM announcements
   WHERE status = 'open' AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
```
Called daily from `/api/cron/expire-announcements` (mirrors the pattern in
`app/api/cron/monthly-scores/route.ts`).

---

## 3. Migration

**File:** `supabase/migrations/060_announcements.sql`

Contents:
1. `CREATE TYPE announcement_status`
2. `CREATE TABLE announcements` with all columns and defaults (including
   `award_type_id`, `bonus_points`, `score_weight`)
3. Indexes (above) + `CREATE INDEX ON announcements (award_type_id)`
4. `ALTER TABLE tasks ADD COLUMN source_announcement_id uuid REFERENCES announcements(id) ON DELETE SET NULL` + `CREATE INDEX ON tasks (source_announcement_id)`
5. `CREATE TABLE announcement_attachments` (+ index)
6. `CREATE TABLE task_attachments` (+ indexes)
7. `CREATE TRIGGER announcements_updated_at` reusing `set_updated_at()`
8. Enable RLS on `announcements`, `announcement_attachments`, `task_attachments`
9. RLS policies for announcements:
   - `announcements_select_all` (authenticated)
   - `announcements_insert_admin` (`is_admin()` in WITH CHECK)
   - `announcements_update_admin_or_accept` (admin OR member accepting)
   - `announcements_delete_admin`
10. RLS policies for `announcement_attachments`:
    - `select_dept_or_admin` — admin OR member whose dept matches parent
    - `insert_admin` — `is_admin()` only
    - `delete_admin_self_or_open` — admin who uploaded, or any admin if announcement.status='open'
11. RLS policies for `task_attachments`:
    - `select_owner_admin_assigner`
    - `insert_owner_or_admin_pre_approval`
    - `delete_uploader_pre_approval_or_admin`
12. `BEFORE UPDATE` trigger enforcing accept-only-shape for non-admins on `announcements`
13. `expire_open_announcements()` function
14. Storage bucket creation (idempotent) for `announcement-attachments` and `task-attachments` — both private
15. Storage object policies mirroring the table-level rules
16. `GRANT ALL ON announcements, announcement_attachments, task_attachments TO authenticated, service_role;`

No backfill required (new tables).

> **Note:** The award auto-grant on completion is wired in application code
> (the existing `/api/admin/tasks/[id]/approve` route) rather than as a DB
> trigger — same pattern as the existing notification fan-out — so the migration
> only adds the data shape, not the grant behaviour.

---

## 4. API

| Method | Path                                | Auth         | Purpose                                                 |
|--------|-------------------------------------|--------------|---------------------------------------------------------|
| POST   | `/api/admin/announcements`          | admin        | Create announcement                                     |
| GET    | `/api/admin/announcements`          | admin        | List all (with filters: status, department)             |
| GET    | `/api/admin/announcements/[id]`     | admin        | Detail (includes `accepted_by` profile + linked task)   |
| PATCH  | `/api/admin/announcements/[id]`     | admin        | Edit (rejected if `status='active'`)                    |
| DELETE | `/api/admin/announcements/[id]`     | admin        | Delete                                                  |
| GET    | `/api/announcements`                | member       | List visible (their department, status='open' + any they personally accepted) |
| POST   | `/api/announcements/[id]/accept`    | member       | Accept → creates task, flips announcement to `active`   |
| **Attachments — announcements** | | | |
| POST   | `/api/admin/announcements/[id]/attachments`            | admin       | Multipart upload (1 file per request, repeat for multiple). Validates MIME + size; inserts into `announcement_attachments` and uploads to bucket. Returns the row + a signed view URL. |
| GET    | `/api/announcements/[id]/attachments`                  | dept-member or admin | List attachments with short-lived signed URLs |
| DELETE | `/api/admin/announcements/[id]/attachments/[attachId]` | admin       | Delete row + bucket object                             |
| **Attachments — tasks** | | | |
| POST   | `/api/tasks/[id]/attachments`                          | task owner or admin (only while task not approved) | Multipart upload — proof-of-success screenshot |
| GET    | `/api/tasks/[id]/attachments`                          | task owner, assigner, or admin | List with signed URLs |
| DELETE | `/api/tasks/[id]/attachments/[attachId]`               | uploader (own + pre-approval) or admin | Delete row + bucket object |
| **Cron** | | | |
| POST   | `/api/cron/expire-announcements`    | cron secret  | Daily expiry of `open` rows past `expires_at`           |

### `POST /api/announcements/[id]/accept` semantics
1. Verify caller's `profiles.department` matches announcement's `department`.
2. Verify announcement `status = 'open'`.
3. In a single transaction (or two-step with compensating delete):
   - Insert a row into `tasks` with:
     - `user_id = auth.uid()`
     - `title`, `description`, `priority`, `category`, `task_type`, `complexity` copied from announcement
     - `due_date = announcement.due_date`
     - `assigned_by = announcement.created_by` (so the admin gets the approval ping when the task is completed, matching existing routing in `app/api/tasks/[id]/status/route.ts`)
     - `status = 'todo'`, `is_draft = false`
     - `score_weight = announcement.score_weight` if non-null (otherwise let the existing auto-calc from task_type × complexity run)
     - `source_announcement_id = announcement.id` (so the edit form can lock due_date and the completion flow can grant the award)
   - Update announcement: `status='active'`, `accepted_by=auth.uid()`, `accepted_at=now()`, `accepted_task_id=<new task id>`.
4. Return the new task id so the UI can navigate to it.

### Attachment upload contract (shared by both endpoints)

- Content-Type: `multipart/form-data`, single field name `file`.
- **Allowed MIME types:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
  Any other type → 415.
- **Max size:** 5 MB (`5_242_880` bytes). Server enforces; the client should
  also enforce pre-upload to give the user immediate feedback.
- **Per-parent cap:** 5 attachments per announcement, 10 per task. Exceeding
  → 422 with `{ error: 'limit_reached', limit: 5 }`.
- Server flow:
  1. Validate role + that the parent (announcement or task) exists and is
     accessible to the caller.
  2. Validate MIME + size.
  3. Generate `storage_path = '{parent_id}/{uuid}-{sanitized_filename}'`.
  4. Upload to the bucket using the service-role client.
  5. Insert into the attachments table with `uploaded_by = auth.uid()`.
  6. Mint a signed view URL (TTL 5 min) and return `{ row, viewUrl }`.
- **GET (list)** never returns raw paths — only fresh signed URLs minted at
  request time. The client should re-fetch the list if a session is long-lived
  enough for URLs to expire.

### Award + bonus-points grant on completion
The award is *promised* by the announcement and *granted* when the resulting task
is approved as done.

- The existing task-approval endpoint (`app/api/admin/tasks/[id]/approve/route.ts`)
  already runs when an admin approves a `done` task.
- Extend it: after the task is marked approved, if
  `tasks.source_announcement_id IS NOT NULL`, look up the linked announcement; if
  `award_type_id` is set and no `user_awards` row exists yet for this
  (user_id, task_id) pair, insert one with:
  - `award_type_id = announcement.award_type_id`
  - `bonus_points  = announcement.bonus_points` (the per-announcement value, may
    differ from the award_type's default)
  - `task_id       = tasks.id`
  - `awarded_by    = announcement.created_by`
  - `month`, `year` derived from `tasks.due_date` (matches `user_awards` shape)
  - `note          = 'Auto-granted from announcement: ' || announcement.title`
- This keeps the existing manual-award flow intact and only auto-fires when an
  announcement-sourced task is approved. Inserting into `user_awards` triggers
  the existing `update_user_monthly_score` recompute, so `monthly_scores.bonus_points`
  updates automatically.
- If `award_type_id` is NULL but `bonus_points > 0` on the announcement, we still
  auto-grant — but tied to a "Generic Bonus" award type. (Decide in Q6 whether
  this case should be disallowed in the form instead, requiring an award_type
  whenever bonus_points > 0.)

The task UI must respect "due_date locked": the existing `/tasks/[id]/edit` page
should treat the date field as read-only when the task was created from an
announcement. Easiest signal: add a nullable `source_announcement_id` column on
`tasks` so the edit form can disable the date input.

> **Migration note:** This requires a second migration step **or** adding the
> column inside `060`:
> ```sql
> ALTER TABLE tasks ADD COLUMN source_announcement_id uuid
>   REFERENCES announcements(id) ON DELETE SET NULL;
> CREATE INDEX ON tasks (source_announcement_id);
> ```
> Recommend keeping it in `060` so the FK and edit-form logic ship together.

---

## 5. Screens

> **Design principle (member-facing only):** The award name and total points
> are the lede on every member surface. They sit *above* the announcement title,
> rendered larger and with color emphasis, so the answer to "what's in it for
> me?" is visible before the user reads anything else. Admin surfaces keep the
> reward as informational (column / badge) — it does not need to motivate them.

### A. Admin — Announcements list  `/admin/announcements`

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Announcements                                              [+ New Announcement]│
│ Filters: [Status ▾] [Department ▾] [Award ▾]                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│ TITLE                       DEPT  DUE      AWARD            POINTS   STATUS    │
│ Improve Edstellar blog tr…  SEO   Jun 30   📈 Impact Crea…  50 + 30  [Open]    │
│ Refresh top 10 LinkedIn ads SEO   May 28   ⚡ Speed Champ…   30 + 20  [Active] │
│                                                                Spandana →     │
│ Audit competitor pages      SEO   Jun 15   — (no award)      40       [Open]  │
└───────────────────────────────────────────────────────────────────────────────┘
```
- AWARD column shows the award_type icon + name, or "—" if none.
- POINTS column shows `<score_weight> + <bonus_points>` (task points + bonus).
  If `score_weight` is left to auto-calc, render as `auto + 30`.
- "Active" rows are clickable → opens the linked task (`accepted_task_id`).
- "Open" rows clickable → admin detail/edit page.
- Row right-click / kebab → Delete.

### B. Admin — Create / Edit form  `/admin/announcements/new` and `/admin/announcements/[id]/edit`

```
┌──────────────────────────────────────────────────────────────────────┐
│ New Announcement                                          [Cancel] [Save]│
├──────────────────────────────────────────────────────────────────────┤
│ Title           [______________________________________________]    │
│ Description     [                                              ]    │
│                 [                                              ]    │
│ Department      [SEO ▾]                                              │
│ Due Date        [📅 2026-06-30]                                       │
│ Priority        [High ▾]                                              │
│ Task Type       [Content ▾]   Complexity [Medium ▾]   Category [SEO ▾]│
│                                                                       │
│ ── Screenshots (reference) ──────────────────────────────────────── │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │  ⬆ Drop screenshots here or click to upload                    │  │
│ │  PNG / JPG / WEBP / GIF · max 5 MB each · up to 5 files        │  │
│ └───────────────────────────────────────────────────────────────┘  │
│  ┌───────┐  ┌───────┐  ┌───────┐                                    │
│  │ 📷    │  │ 📷    │  │ 📷    │   ← thumbnails of uploaded files    │
│  │ × del │  │ × del │  │ × del │      hover to remove                │
│  └───────┘  └───────┘  └───────┘                                    │
│                                                                       │
│ ── Reward ────────────────────────────────────────────────────────── │
│ Award type      [📈 Impact Creator ▾]   (default bonus: 50)           │
│ Bonus points    [ 50 ]  ← override default if needed                  │
│ Task points     ( ) Auto (from task_type × complexity)                │
│                 (•) Custom  [ 30 ]                                    │
│                                                                       │
│ Preview         🏆 Impact Creator   30 task pts  +  50 bonus = 80 pts │
└──────────────────────────────────────────────────────────────────────┘
```

- Fields: Title, Description (textarea), Department (select from existing dept
  values found in `profiles.department`), Due Date (date picker), Priority,
  optional Task Type, Complexity, Category.
- **Screenshots section:**
  - Drag-drop zone (also clickable). Up to 5 files, image-only, 5 MB each.
  - On drop: file uploads start immediately; a thumbnail appears with a
    spinner overlay → check on success → red × on hover for removal.
  - Failed uploads (size/type/limit) show an inline error pill under the zone.
  - The form does **not** commit attachments to the announcement until the
    Save button is pressed — until then they're staged client-side. (Alternative
    if simpler: create a draft announcement, attach, then publish. Either works;
    flag in Q7.)
- **Reward section:**
  - Award type — select from `award_types` (active only). Optional.
  - Bonus points — pre-fills from `award_types.bonus_points` when an award is
    chosen, but admin can override (e.g. 25 for a partial-credit version).
  - Task points — radio: auto (use task_type × complexity formula) or custom
    integer (sets `score_weight` directly).
  - Live preview tile shows `<icon> <name>   N task pts + M bonus = Total pts`.
- Edit is disabled if `status='active'`; a banner explains why. (Screenshots
  remain manageable while open; see RLS for delete rules.)

### C. Admin — Announcement detail  `/admin/announcements/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Announcements                                                   │
│ Improve Edstellar blog traffic                          [Active] │
│ SEO · Due Jun 30, 2026 · Priority High                           │
├──────────────────────────────────────────────────────────────────┤
│ Reward                                                            │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 📈 Impact Creator      30 task pts  +  50 bonus = 80 pts      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Reference screenshots                                             │
│ ┌──────┐ ┌──────┐ ┌──────┐                                       │
│ │ 📷  │ │ 📷  │ │ 📷  │   ← click to lightbox · admin: × to delete│
│ └──────┘ └──────┘ └──────┘                                       │
│                                                                   │
│ Accepted by                                                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ [Kiran R]  Accepted May 23, 2026 →  Open task                │ │
│ │            Task status: In Progress                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Proof of success (uploaded by Kiran R on the task)                │
│ ┌──────┐ ┌──────┐                                                 │
│ │ 📷  │ │ 📷  │   ← lightboxes; admin can view but not delete    │
│ └──────┘ └──────┘                                                 │
│                                                                   │
│ [Delete announcement]                                             │
└──────────────────────────────────────────────────────────────────┘
```

- All fields, status pill, reward summary, **reference screenshots gallery**,
  who accepted (with avatar) and when, link to the created task, and a
  read-through gallery of the member's **proof-of-success screenshots** so
  the admin can review them without leaving this page. Delete button (with confirm).
- Clicking any thumbnail opens a full-size lightbox (existing lightbox component
  if one exists; otherwise a thin wrapper around a `<dialog>` element).

### D. Member — Announcements page  `/announcements`

The reward is the **hero** of each card. It is placed as a prominent header
strip with a gradient background and the total points rendered in oversized
type, so a member scanning the page sees the prize first and the work second.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Announcements                                                               │
│ Open for SEO                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ ╔══════════════════════════════════════════════════════════════════╗ │ │
│ │ ║  📈  IMPACT  CREATOR                                  ┌─────────┐ ║ │ │
│ │ ║  Award                                                │   80    │ ║ │ │
│ │ ║  30 task pts  +  50 bonus pts                         │  POINTS │ ║ │ │
│ │ ║                                                       └─────────┘ ║ │ │
│ │ ╚══════════════════════════════════════════════════════════════════╝ │ │
│ │ Improve Edstellar blog traffic                     Due Jun 30, 2026    │ │
│ │ From 100 → 300 clicks per month                                        │ │
│ │ Priority: High · Type: Content                                         │ │
│ │ ┌────────────────────────────────────────────────────────────────┐  │ │
│ │ │ Reference from admin                                            │  │ │
│ │ │ ┌──────┐ ┌──────┐ ┌──────┐                                      │  │ │
│ │ │ │ 📷  │ │ 📷  │ │ 📷  │   click to lightbox                     │  │ │
│ │ │ └──────┘ └──────┘ └──────┘                                      │  │ │
│ │ └────────────────────────────────────────────────────────────────┘  │ │
│ │                                              [ Accept & Add to Tasks ] │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ My accepted                                                                  │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚡ SPEED CHAMPION · 50 pts on completion                                │ │
│ │ Refresh top 10 LinkedIn ads          Accepted May 19 · Open task →    │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

**Reward hero strip — UI spec**
- Full-width header strip inside the card, gradient background tinted by the
  award (amber/gold default; emerald for green-toned awards like Quality, etc.).
  Use a `bg-gradient-to-r from-amber-100 via-amber-50 to-yellow-100` style, with
  the equivalent dark-mode mapping for visibility.
- Left side: **large award icon** (~36px), then award **NAME in uppercase**,
  small "Award" label underneath, then `<task pts> + <bonus pts>` breakdown in
  muted text.
- Right side: **total points** in a chip — number rendered at ~32px bold, with
  the word "POINTS" beneath at ~10px tracking-wide. This is the "trophy"
  numeric the eye should land on first.
- If `award_type_id IS NULL` but `bonus_points > 0` — render as "Bonus only"
  with the bonus icon; if both are zero, hide the strip entirely (no incentive
  to show).
- Subtle pulse / shimmer animation on first render (CSS `animate-pulse` for
  ~1.5s, then settles) — only when the announcement is `open`, never on the
  "My accepted" cards. This is the visual hook that says "look here first".

**Content placement**
- Title and metadata sit *below* the reward strip — by the time the eye reaches
  them the member has already seen what they stand to win.
- Accept button is large, primary-colored, full-width on mobile.

**"My accepted" cards**
- Reuse the reward strip but slim (32px tall) with `opacity-90` and no
  animation — it's a status reminder, not an enticement.
- "X pts on completion" shorthand instead of the full breakdown to keep it
  compact.

Other behaviour:
- Only shows announcements where `department = my profile.department`.
- "My accepted" section pulls rows where `accepted_by = me`.
- Empty state: "No announcements for your department right now."

### E. Member — Dashboard widget  `/dashboard` (top-of-page, member view only)

Even in the compact dashboard variant, the reward stays the visual focal
point — the points number is bigger than the announcement title.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 📣 Announcements for SEO                                       See all →    │
│ ┌──────────────────────────────────┐  ┌──────────────────────────────────┐│
│ │ ┌──────┐  📈 IMPACT CREATOR      │  │ ┌──────┐  ⚡ SPEED CHAMPION       ││
│ │ │  80  │  Improve Edstellar blog │  │ │  40  │  Audit competitor pages ││
│ │ │ PTS  │  Due Jun 30              │  │ │ PTS  │  Due Jun 15              ││
│ │ └──────┘                          │  │ └──────┘                          ││
│ │                       [ Accept ] │  │                       [ Accept ] ││
│ └──────────────────────────────────┘  └──────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

**Reward chip — UI spec**
- Left-aligned **points pill** (~64px × 64px), gradient amber background,
  rounded-xl, with the number in `text-2xl font-bold` and "PTS" below.
- To its right: award icon (~16px inline) + **award NAME in uppercase**,
  title under it (truncated), then due date in muted text.
- The points pill animates a brief shimmer on first paint (`animate-pulse`
  once) to draw the eye.

Other behaviour:
- Most recent 1–3 open announcements for the member's department, swipeable on
  mobile.
- If none open → widget is hidden entirely (no empty card).
- Reuses the same `<AnnouncementCard>` used on `/announcements`, in `variant="compact"`.

### G. Member — Accept confirmation modal

Clicking **Accept** does **not** create the task immediately — a confirmation
modal opens so the member can confirm what they're committing to (especially
the locked due date). Hard rule: due date cannot be changed here or later.

```
┌──────────────────────────────────────────────────────────────────┐
│  Accept this announcement?                                  [×]  │
├──────────────────────────────────────────────────────────────────┤
│  ╔════════════════════════════════════════════════════════════╗  │
│  ║  📈  IMPACT CREATOR                            ┌────────┐  ║  │
│  ║  Award                                         │   80   │  ║  │
│  ║  30 task pts  +  50 bonus pts                  │  PTS   │  ║  │
│  ║                                                └────────┘  ║  │
│  ╚════════════════════════════════════════════════════════════╝  │
│                                                                    │
│  TASK YOU'LL BE COMMITTING TO                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Improve Edstellar blog traffic                              │  │
│  │ From 100 → 300 clicks per month                             │  │
│  │                                                              │  │
│  │ 🔒 Due  Jun 30, 2026   (set by admin · cannot be changed)   │  │
│  │ Priority  High                                               │  │
│  │ Type      Content · Medium                                   │  │
│  │                                                              │  │
│  │ Reference screenshots from admin                             │  │
│  │ ┌──────┐ ┌──────┐ ┌──────┐                                   │  │
│  │ │ 📷  │ │ 📷  │ │ 📷  │  click to lightbox                   │  │
│  │ └──────┘ └──────┘ └──────┘                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ⚠  Once accepted, this becomes a task on your list and other     │
│     teammates can no longer accept it.                            │
│                                                                    │
│                            [Cancel]    [ Yes, accept this task ]  │
└──────────────────────────────────────────────────────────────────┘
```

- Primary action button is large, amber/gold tinted (matches the reward strip).
- Race-condition handling: if the POST `/accept` returns 409 because someone
  beat them to it, swap the modal body for an empty-state ("Already accepted
  by Kiran R · See active announcement →") and replace the button with [Close].
- The "🔒 Due" line has a tooltip on hover: *"Set by the admin who created
  this announcement. Locked to this date even after acceptance."*

### H. Member — Post-accept success state

On success the modal is replaced (or, on `/dashboard`, the card is replaced)
with a short celebratory confirmation. Stays mounted for ~5 seconds, then
either auto-redirects to the new task or returns to the announcements list.

```
┌──────────────────────────────────────────────────────────────────┐
│                            ✅                                     │
│                                                                    │
│                  Task created — go earn 80 pts!                   │
│                                                                    │
│  Improve Edstellar blog traffic is now on your task list.         │
│  📈 Impact Creator + 50 bonus pts will be granted when an admin   │
│  approves the completed task.                                      │
│                                                                    │
│            [ Open task → ]      [ Back to announcements ]         │
└──────────────────────────────────────────────────────────────────┘
```

- Subtle confetti / spark animation on the trophy icon for ~1.5s — same
  motivational cue as the original reward strip's shimmer, but punchier.
- "Open task →" navigates to `/tasks/{accepted_task_id}` which loads the
  newly-created task (already exists; no new route).

### I. Member — Differentiation on My Tasks  `/tasks`

Announcement-sourced tasks stand out in two ways:
- A **left edge ribbon** in amber/gold matching the reward strip
- An inline **reward badge** in the row, with the award icon + total points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ My Tasks                                                                     │
│ Filters: [Status ▾] [Priority ▾] [Source ▾  ⟵ new: All / Announcements]      │
├─────────────────────────────────────────────────────────────────────────────┤
│ │📣│ Improve Edstellar blog traffic         [In Progress]    Due Jun 30      │
│ │  │ 📈 Impact Creator · +80 pts on approval         🔒 Locked from announcement│
│ ├──┴──────────────────────────────────────────────────────────────────────── │
│      Rewrite landing page H1                  [Todo]          Due Jun 12     │
│      Auto-calc score: 20 pts                                                  │
│ ─────────────────────────────────────────────────────────────────────────── │
│ │📣│ Refresh top 10 LinkedIn ads             [Done]           Due May 28     │
│ │  │ ⚡ Speed Champion · +50 pts (granted on approval)  ⏳ Pending approval  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Visual rules (announcement-sourced rows)**
- Left edge ribbon: 4px wide, `bg-gradient-to-b from-amber-400 to-amber-600`,
  with a tiny 📣 icon centered vertically halfway down.
- Reward badge: pill `bg-amber-50 text-amber-800 border border-amber-200`
  rendered immediately under the title, never wrapping (truncate if needed).
- Row background tint: very subtle `bg-amber-50/30` (hover ramps to `/50`).
- The 🔒 inline pill ("Locked from announcement") clarifies why the due date
  isn't editable on this row.

**New filter**
- "Source" filter in the existing filter row: `All` (default) / `Announcements`
  / `Direct`. Backed by `tasks.source_announcement_id IS NULL` test.

**Attachment count indicator**
- A small `📷 N` chip next to the due date when the task has ≥ 1 attachment
  (sums admin-reference + member-proof if from an announcement; just proof
  otherwise). Click-through opens the task with the attachments scrolled into
  view.

### J. Admin — Differentiation on `/admin/monthly-tasks/[year]/[month]/[userId]`

Same visual language applies to the admin's user-month view. Both the Pending
(red) and Completed (green) panels keep their status-driven row background, but
announcement-sourced rows pick up the gold left ribbon and the reward badge so
the admin can see at a glance which tasks carry an award promise.

```
┌─ Pending (red panel) ────────────────────────────────────────────────────────┐
│ Task                          Type     Cmplx   Pri    Status        Due       │
├──────────────────────────────────────────────────────────────────────────────┤
│ │📣│ Improve Edstellar blog … Content  Medium  High   [In Progress]  Jun 30   │
│ │  │ 📈 Impact Creator · +80 pts on approval                                  │
│      Rewrite landing page H1  Content  Easy    Med    [Todo]         Jun 12   │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Completed (green panel) ────────────────────────────────────────────────────┐
│ │📣│ Refresh top 10 LinkedIn… SEO Ads  Hard    High   [Done]          May 28 │
│ │  │ ⚡ Speed Champion · +50 pts (granted on approval) ⏳ Pending approval  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The gold left ribbon is rendered **on top of** the red/green status tint, so
  both signals are visible at once: status tint = row bg, announcement origin =
  left ribbon + reward badge.
- The reward badge in the Completed panel adds *"granted on approval"* wording
  to make it clear the bonus points have not been added yet — they fire when
  the admin approves the task (see Section 4 "Award + bonus-points grant on
  completion").
- Each row also surfaces a small `📷 N` chip next to the Due column when the
  task carries attachments — same indicator as on `/tasks`. Clicking opens
  the task with proof scrolled into view, giving the admin a fast review path.
- The summary card at the top of the page (Total Points / Bonus / Completion)
  is unchanged — those numbers already roll up announcement-granted bonuses
  via `user_awards` → `monthly_scores.bonus_points`.

### K. Task detail / edit — locked due date

Whether the member opens the task via `/tasks/[id]` or `/tasks/[id]/edit`, the
due date field is **disabled** when `source_announcement_id IS NOT NULL`.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Improve Edstellar blog traffic                              [Save]    │
├──────────────────────────────────────────────────────────────────────┤
│ Title         [Improve Edstellar blog traffic_______________]         │
│ Description   [From 100 → 300 clicks per month             ]         │
│ Status        [In Progress ▾]                                         │
│ Priority      [High ▾]                                                │
│ Due date      [📅 Jun 30, 2026]  🔒  ← read-only                       │
│               Locked — set by the announcement "Improve Edstellar     │
│               blog traffic". Talk to the admin to change.             │
│                                                                        │
│ ── Linked announcement ──────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ 📈 Impact Creator   80 pts on approval                        │    │
│ │ Created May 23 by Vijay · See announcement →                  │    │
│ │                                                                │    │
│ │ Reference from admin                                           │    │
│ │ ┌──────┐ ┌──────┐ ┌──────┐                                     │    │
│ │ │ 📷  │ │ 📷  │ │ 📷  │  click to lightbox                     │    │
│ │ └──────┘ └──────┘ └──────┘                                     │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│ ── Proof of success (upload your screenshots) ───────────────────── │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │  ⬆ Drop screenshots here or click to upload                   │    │
│ │  PNG / JPG / WEBP / GIF · max 5 MB each · up to 10 files      │    │
│ └──────────────────────────────────────────────────────────────┘    │
│ ┌──────┐ ┌──────┐                                                    │
│ │ 📷  │ │ 📷  │   uploaded May 24 · × remove (before approval)      │
│ └──────┘ └──────┘                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

- Disabled date input with a 🔒 trailing icon; helper text below explains why.
- "Linked announcement" mini-card shows the reward summary, links back to
  the announcement detail page, and embeds the **admin's reference
  screenshots** inline so the member can scroll back to them mid-task. Admin
  sees the same card with an "Unlink" action (sets `source_announcement_id =
  NULL`) for the Q3 escape hatch.
- "Proof of success" upload zone lives directly below the linked-announcement
  card so the member's mental model is: *here's what they asked for → here's
  what I delivered*. Upload behaviour matches the admin's zone (drag-drop,
  thumbnails, inline errors, ≤ 5 MB, image-only).
- Once the task is **approved** the upload zone is replaced with a read-only
  gallery — files become immutable. (Admins retain a delete affordance per
  RLS.)

### F. Sidebar
- New admin-only entry: **Announcements** → `/admin/announcements` (`Megaphone`
  icon from lucide-react).
- New member-only entry: **Announcements** → `/announcements`.
- Both placed after their respective "Monthly Tasks" entries.

---

## 6. Components

| Component                       | Where used                                     |
|---------------------------------|------------------------------------------------|
| `RewardStrip`                   | hero strip on member announcement card (full variant) |
| `RewardChip`                    | compact points pill for dashboard widget + "My accepted" list |
| `AnnouncementCard`              | `/dashboard` widget + `/announcements` page; takes `variant: 'full' \| 'compact'` and composes `RewardStrip` or `RewardChip` accordingly |
| `AnnouncementForm`              | admin new/edit pages                           |
| `AnnouncementsTable`            | admin list page                                |
| `AcceptAnnouncementButton`      | wraps the POST `/accept` call + redirects to the new task |
| `AcceptConfirmationModal`       | screen G — confirmation dialog with reward strip + locked due date |
| `AcceptSuccessState`            | screen H — celebratory post-accept confirmation |
| `DashboardAnnouncementsWidget`  | server-fetched, gated on member role           |
| `TaskAnnouncementRibbon`        | gold left edge ribbon — added to `/tasks` row and `MonthUserClient` rows when `source_announcement_id` is set |
| `TaskRewardBadge`               | inline pill rendered under the task title showing award icon + total pts ("granted on approval" copy when status='done') |
| `LinkedAnnouncementCard`        | bottom-of-task-edit card linking back to the announcement |
| `ScreenshotUploader`            | shared drag-drop + thumbnail strip used by admin announcement form AND member task edit. Props: `parentType: 'announcement' \| 'task'`, `parentId`, `maxFiles`, `readOnly`. |
| `ScreenshotGallery`             | read-only thumbnail row used on member announcement card, admin detail page, accept modal, linked-announcement mini-card. Click → lightbox. |
| `ScreenshotLightbox`            | full-size image viewer with prev/next + close. |

---

## 7. Cron

- New file: `app/api/cron/expire-announcements/route.ts`
  - Calls `expire_open_announcements()` via service role.
  - Auth pattern same as `app/api/cron/monthly-scores/route.ts` (CRON_SECRET).
- Scheduled daily (Vercel cron entry to be added to `vercel.json`, matching the
  existing daily digests).

---

## 8. Sequencing / Build Order

1. `060_announcements.sql` migration:
   - announcements + announcement_attachments + task_attachments tables
   - tasks.source_announcement_id column
   - RLS, triggers, expire fn
   - Storage bucket creation (`announcement-attachments`, `task-attachments`) + object policies
2. Attachment service module (server-only) — wraps upload validation, path
   generation, signed URL minting; reused by the four endpoints.
3. API routes:
   - Announcement CRUD (admin), list/accept (member), cron
   - Attachment endpoints (announcements ×3, tasks ×3)
4. Shared atoms: `RewardStrip`, `RewardChip`, `ScreenshotUploader`, `ScreenshotGallery`, `ScreenshotLightbox`, `AnnouncementCard`, `AcceptAnnouncementButton`.
5. **Accept confirmation modal** (screen G) wired into `AcceptAnnouncementButton` — embeds `ScreenshotGallery`.
6. Admin pages: list, new (with `ScreenshotUploader`), edit, detail (with both galleries).
7. Member page: `/announcements` (with `ScreenshotGallery` inside each card, post-accept success state H).
8. Dashboard widget (only renders for non-admin role).
9. Extend approval route (`/api/admin/tasks/[id]/approve`) to auto-grant `user_awards` when an announcement-sourced task is approved.
10. **Task list differentiation** (screens I, J):
    - `/tasks` row component picks up the gold ribbon + reward badge + Source filter + `📷 N` attachment chip.
    - `MonthUserClient` Pending/Completed rows pick up the same ribbon/badge/chip over their status tint.
11. **Task edit** (`/tasks/[id]/edit`):
    - Lock `due_date` when `source_announcement_id IS NOT NULL`
    - Render the "Linked announcement" mini-card (with embedded admin reference gallery)
    - Render the "Proof of success" `ScreenshotUploader` (becomes read-only once the task is approved)
12. Pending-approval admin page — surface the member's proof gallery so admins can review it before approving (extends existing `/admin/pending-approvals`).
13. Sidebar entries.
14. Cron route + Vercel cron entry.

---

## 9. Open Questions / Decisions

- **Q1. Single-accept vs multi-accept?** ✅ **Resolved: single-accept.** First
  acceptance flips the announcement to `active` and no further accepts are
  allowed.
- **Q2. Multi-department announcements?** ✅ **Resolved: multi-department.** An
  announcement can be tagged with one or more departments. Data model uses
  `departments text[]`. A member sees an announcement if their
  `profiles.department` is `ANY(announcements.departments)`.
- **Q3. Should an admin be able to revoke an `active` announcement?** Still open.
  Current plan: yes via DELETE (which sets `source_announcement_id` on the task
  to NULL and unlocks its due date), but does NOT delete the task.
- **Q4. Notifications?** ✅ **Resolved: notify all members of the target
  departments on create.** When an announcement is created, fan out a row into
  `notifications` for every active member whose `department = ANY(departments)`.
  No schema change needed.
- **Q5. Edit window after creation?** ✅ **Resolved: free edits while `open`.**
  Once status flips to `active`, edits are blocked.
- **Q6. Bonus points without an award type?** *Ignored by user — proceeding
  with the recommended default (a):* require `award_type_id` whenever
  `bonus_points > 0`. UI form nudges the admin accordingly.
- **Q7. Attachment upload at form-time: staged or via draft?** *Ignored by
  user — proceeding with the default (a):* stage files client-side, upload all
  on Save. No `draft` status added in v1.
- **Q8. Lightbox component reuse.** *Ignored by user — proceeding with the
  default:* the plan ships a thin `<dialog>`-based `ScreenshotLightbox`. If we
  later discover an existing lightbox in the codebase, swap it in.

