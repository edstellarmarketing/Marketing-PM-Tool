# Role & Feature Plan — Admin / Team Lead / Member

## Why this change

Today the app has **two roles** (`admin`, `member`) defined in
`supabase/migrations/001_create_schema_and_tables.sql`:

```sql
CREATE TYPE "Marketing-PM-Tool".user_role AS ENUM ('admin', 'member');
```

Every privileged action funnels through a single `admin` — enforced by
`requireAdmin()` (`lib/api.ts:20`) at the API layer and `is_admin()`
(`supabase/migrations/002_rls_policies.sql:11`) at the database (RLS) layer.
One admin cannot realistically approve tasks, reconcile attendance, run
appraisals, and manage every user across all departments.

**Goal:** introduce a third role, **`team_lead`**, scoped to a single
**department**. A team lead handles *most* day-to-day management for the people
in their own department, while a small set of **system-wide / sensitive**
features stays **admin-only**.

---

## The three roles at a glance

| Role | Scope | One-line definition |
|------|-------|---------------------|
| **Admin** | Whole organisation | System owner. Controls roles, scoring rules, taxonomy, system settings, and anything that crosses departments. |
| **Team Lead** | **Their own department only** | Operational manager. Runs tasks, approvals, attendance, awards, appraisals, and project work *for members in their department*. |
| **Member** | **Their own data only** | Individual contributor. Owns their plans, tasks, attendance, notes, and profile; consumes shared/read-only data. |

**Core scoping rule for Team Lead:** every Team Lead capability below is
implicitly filtered to *records belonging to users whose `profiles.department`
equals the team lead's `profiles.department`* (and, for project work, to
projects/owners in that department). A Team Lead can **never** act on another
department's data, and can **never** touch global configuration.

---

## Feature matrix (column-wise)

Legend: ✅ full access · 🟡 scoped / limited (see notes) · ❌ no access ·
**(own)** = only their own records · **(dept)** = only their department

### 1 · User & access management

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Invite / create users | ✅ | ❌ | ❌ | `app/api/admin/invite` — admin only |
| **Assign / change roles** (admin, team_lead, member) | ✅ | ❌ | ❌ | Privilege escalation — admin only |
| Appoint a department's Team Lead | ✅ | ❌ | ❌ | Special case of role assignment |
| Edit a user's department | ✅ | ❌ | ❌ | Moving people between depts is org-level |
| Edit designation / details | ✅ | 🟡 (dept) | ❌ | Team Lead may edit non-role profile fields for own dept |
| Activate / deactivate a user | ✅ | 🟡 (dept) | ❌ | Team Lead may deactivate within own dept; admin org-wide |
| Delete a user | ✅ | ❌ | ❌ | Destructive — admin only |
| View user list | ✅ (all) | 🟡 (dept) | ❌ | Team Lead sees only their department roster |
| Edit own profile / avatar | ✅ | ✅ | ✅ (own) | `app/api/profile` |

### 2 · Plans & tasks (personal monthly work)

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Create / edit **own** monthly plan & tasks | ✅ | ✅ | ✅ (own) | `app/api/plans`, `app/api/tasks` |
| Assign tasks to another user | ✅ (any) | 🟡 (dept) | ❌ | `app/api/admin/tasks` |
| View all tasks across org | ✅ | ❌ | ❌ | `admin/all-tasks` — cross-dept stays admin |
| View dept members' tasks / monthly overview | ✅ | 🟡 (dept) | ❌ | `admin/monthly-tasks` scoped to dept |
| **Approve / reject completed tasks** | ✅ | 🟡 (dept) | ❌ | `app/api/admin/tasks/[id]/approve` |
| Approve task **date-change requests** | ✅ | 🟡 (dept) | ❌ | `app/api/admin/date-change-requests` |
| AI suggest tasks for self | ✅ | ✅ | ✅ (own) | `app/api/ai/suggest-tasks` |

### 3 · Scoring, points & leaderboard

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| **Edit point config / scoring weights** | ✅ | ❌ | ❌ | "Rules of the game" — admin only |
| **Edit volume-adjusted / complexity scoring** | ✅ | ❌ | ❌ | admin only |
| Lock / unlock scoring | ✅ | ❌ | ❌ | admin only |
| Recalculate scores (org-wide) | ✅ | ❌ | ❌ | `app/api/admin/scores/recalculate` |
| Recalculate scores (one user) | ✅ | 🟡 (dept) | ❌ | Team Lead may trigger for own dept |
| View leaderboard | ✅ | ✅ | ✅ | `app/(app)/leaderboard` — read-only for all |

> Scoring **configuration** must stay admin-only: it determines every member's
> rank and feeds appraisals. Team Leads may *trigger recalculation* for their
> own people but never change the formula.

### 4 · Appraisals (performance reviews)

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Generate / draft appraisal (AI summary) | ✅ | 🟡 (dept) | ❌ | `app/api/admin/appraisals` |
| Edit appraisal strengths / improvements | ✅ | 🟡 (dept) | ❌ | Team Lead drafts for own dept |
| **Publish appraisal** | ✅ | 🟡 (dept) | ❌ | `…/[userId]/publish` — see note |
| View **own** published appraisal | ✅ | ✅ | ✅ (own) | Members see only their own, once published |
| View any user's appraisal | ✅ (all) | 🟡 (dept) | ❌ | |

> **Decision point — appraisal publish.** Two acceptable models:
> **(a)** Team Lead drafts, **Admin publishes** (extra HR control); or
> **(b)** Team Lead drafts **and publishes** for their own dept (max offload).
> Default recommendation: **(b)** to genuinely relieve the admin, with Admin
> retaining override/unpublish.

### 5 · Awards & bonus points

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| **Define award types** (the catalogue) | ✅ | ❌ | ❌ | `app/api/admin/award-types` — admin only |
| Grant an award to a user | ✅ (any) | 🟡 (dept) | ❌ | `app/api/admin/awards` |
| Grant attendance bonus points | ✅ | 🟡 (dept) | ❌ | `app/api/attendance/award-bonus` |
| View own awards | ✅ | ✅ | ✅ (own) | `app/api/awards/me` |

### 6 · Attendance

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Log own attendance (incl. half-day) | ✅ | ✅ | ✅ (own) | `app/api/attendance` |
| **Approve attendance** | ✅ | 🟡 (dept) | ❌ | `app/api/attendance/admin` |
| Edit / correct others' records | ✅ | 🟡 (dept) | ❌ | `app/api/attendance/[id]` |
| View dept attendance | ✅ (all) | 🟡 (dept) | ❌ | `admin/attendance` |

### 7 · Announcements

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Create **org-wide** announcement | ✅ | ❌ | ❌ | Broadcast to whole org — admin only |
| Create **department** announcement | ✅ | 🟡 (dept) | ❌ | Scoped to own dept audience |
| Edit / delete own announcement | ✅ | 🟡 (dept) | ❌ | `app/api/admin/announcements` |
| Manage attachments | ✅ | 🟡 (dept) | ❌ | |
| Approve acceptances | ✅ | 🟡 (dept) | ❌ | `…/acceptances/[id]/approve` |
| Read announcements & acknowledge | ✅ | ✅ | ✅ | `app/(app)/announcements` |

### 8 · Projects & project tasks

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Create project | ✅ | 🟡 (dept) | ❌ | `app/api/projects` |
| **Delete project** | ✅ | ❌ | ❌ | Destructive / cross-dept — admin only |
| Manage project owners | ✅ | 🟡 (dept) | ❌ | `…/owners` — own dept ownership |
| Manage owner's member pool | ✅ | 🟡 (dept) | ❌ | `project_owner_members` (mig. 051) |
| Create / edit project tasks | ✅ | 🟡 (dept) | 🟡 | Members edit tasks assigned to them |
| Bulk-delete project tasks | ✅ | 🟡 (dept) | ❌ | `…/tasks/bulk-delete` |

### 9 · Taxonomy, system settings & jobs (the admin core)

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Manage **departments / categories** | ✅ | ❌ | ❌ | `app/api/categories` — global structure |
| Manage **email / digest settings** | ✅ | ❌ | ❌ | `app/api/admin/email-settings` |
| Send test digests | ✅ | ❌ | ❌ | `send-test-owner/project-digest` |
| **Cron jobs** (summaries, scores, expiry, cleanup) | ✅ (system) | ❌ | ❌ | `app/api/cron/*` — secret/service identity |
| **AI team insights** (org / cross-dept) | ✅ | 🟡 (dept) | ❌ | `app/api/ai/team-insights` scoped to dept |
| AI user insights (self) | ✅ | ✅ | ✅ (own) | `app/api/ai/user-insights` |

### 10 · Notes & notifications

| Feature | Admin | Team Lead | Member | Notes |
|---|:--:|:--:|:--:|---|
| Create / edit own notes | ✅ | ✅ | ✅ (own) | `app/api/notes` |
| Receive / read notifications | ✅ | ✅ | ✅ (own) | `app/api/notifications` |

---

## What stays ADMIN-ONLY (the short, deliberate list)

These must **not** be delegated to Team Leads, because they are global,
destructive, or self-policing risks:

1. **Role assignment** — who is admin / team_lead / member (incl. appointing team leads).
2. **Creating, deleting, and cross-department moving of users.**
3. **Scoring rules** — point config, weights, complexity/volume model, lock/unlock.
4. **Departments / categories taxonomy** — the structure everything else hangs on.
5. **Award-type catalogue** — the definitions (granting is delegated; defining is not).
6. **Email / system settings, test digests, and cron jobs.**
7. **Org-wide announcements** and **cross-department visibility** (all-tasks, all-users, org AI insights).
8. **Project deletion.**

Everything else is delegated to Team Leads **within their own department**.

---

## What a Team Lead CAN do (summary)

For **their own department only**: assign & approve tasks, approve date-change
requests, approve & correct attendance, grant awards & bonus points (from the
admin-defined catalogue), draft (and optionally publish) appraisals, post
department announcements, create & run projects/project-tasks, view dept roster
& dept analytics, and trigger per-user score recalculation. They do all of
their own member-level work too.

---

## Implementation notes (how to build it)

### A. Data model
1. Extend the enum:
   ```sql
   ALTER TYPE "Marketing-PM-Tool".user_role ADD VALUE 'team_lead';
   ```
   (Enum value adds are one-way; cannot be removed without recreating the type.)
2. A Team Lead's authority comes from **`profiles.department`** — no new table
   needed for the basic model. Optionally add a `team_leads` mapping table if a
   department can have multiple leads or a lead can cover multiple departments.

### B. Database (RLS) — `supabase/migrations/002_rls_policies.sql`
Add helpers alongside `is_admin()`:
```sql
-- Is the current user a team lead?
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".is_team_lead()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM "Marketing-PM-Tool".profiles
                 WHERE id = auth.uid() AND role = 'team_lead');
$$;

-- Does target user share the current team lead's department?
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".leads_user(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".profiles me, "Marketing-PM-Tool".profiles t
    WHERE me.id = auth.uid() AND me.role = 'team_lead'
      AND t.id = target AND t.department = me.department
  );
$$;
```
Then update delegated-feature policies from
`USING (is_admin())` → `USING (is_admin() OR leads_user(<row's user_id>))`.
Leave admin-only tables (point_config, categories, email_settings, award_types,
role updates on profiles) on `is_admin()` **only**.

### C. API layer — `lib/api.ts`
Add guards mirroring `requireAdmin()`:
- `requireAdminOrTeamLead()` — passes for either role; returns the profile so
  handlers can read `profile.department` for scoping.
- `requireManages(targetUserId)` — admin always passes; team lead passes only
  if `target.department === profile.department`.

Then change delegated routes from `requireAdmin()` to the new guards and apply a
department filter on the query. Keep the admin-only routes (section 9 + the
list above) on `requireAdmin()`.

### D. Pages — `app/(app)/admin/*`
Each admin page currently re-checks `role !== 'admin'` and redirects
(e.g. `app/(app)/admin/page.tsx:12`). For delegated pages, change the guard to
allow `team_lead` and scope the server-side queries to
`profiles.department = <lead's department>`. Keep admin-only pages
(settings, email-settings, point-config, departments, award-types) gated to
`admin`.

### E. Rollout
See the **Phase-wise implementation plan** below for the detailed, sequenced
breakdown (replaces the earlier short rollout list).

> Security reminder: enforce in **both** layers. Route guards give good UX
> errors; RLS is the real boundary (admin/service routes use the service-role
> key and bypass RLS, so their `requireAdmin`/`requireManages` checks are the
> only thing protecting them).

---

## UI / Look & feel per role

The app already varies UI by role through `components/shared/Sidebar.tsx`, which
filters nav items via `adminOnly` / `memberOnly` flags and renders a coloured
**role badge** (purple = admin, blue = member). We extend that pattern rather
than redesign it.

### Role badge

A third badge colour identifies Team Leads, with their department appended:

```
 Admin      → 🟣  admin            (bg-purple-600)
 Team Lead  → 🟢  team lead · SEO  (bg-teal-600)   ← new
 Member     → 🔵  member           (bg-blue-600)
```

The badge sits under the user's name/avatar at the top of the sidebar
(`Sidebar.tsx:89`). For Team Leads, show `team lead · <department>` so the scope
is always visible.

### Sidebar navigation per role

The current boolean flags (`adminOnly`, `memberOnly`) can't express a 3rd role
cleanly. Replace them with an explicit `roles: ('admin'|'team_lead'|'member')[]`
per nav item. The Team Lead sidebar is a **hybrid**: personal/member items at
top, a divided **"Team"** section for department management below, and **no**
global-settings items.

```
┌─ ADMIN ──────────────┐   ┌─ TEAM LEAD ──────────┐   ┌─ MEMBER ─────────────┐
│ 🟣 admin             │   │ 🟢 team lead · SEO   │   │ 🔵 member            │
├──────────────────────┤   ├──────────────────────┤   ├──────────────────────┤
│ Dashboard            │   │ Dashboard            │   │ Dashboard            │
│ Projects             │   │ Projects             │   │ Projects             │
│ All Tasks       (org)│   │ My Tasks             │   │ My Tasks             │
│ Monthly Tasks   (org)│   │ Monthly Tasks        │   │ Monthly Tasks        │
│ Announcements        │   │ Meeting Notes        │   │ Meeting Notes        │
│ Leaderboard          │   │ Attendance           │   │ Attendance           │
│ My Profile           │   │ Leaderboard          │   │ Announcements        │
│ ── Manage ──         │   │ My Performance       │   │ Leaderboard          │
│ Admin (Users)        │   │ My Profile           │   │ My Performance       │
│ Pending Approvals    │   │ ── Team (SEO) ──     │   │ My Profile           │
│ Attendance      (org)│   │ Team Tasks     (dept)│   │ Pending Approvals    │
│ Appraisals      (org)│   │ Pending Approvals    │   └──────────────────────┘
│ Point Settings   ⚙️  │   │ Team Attendance(dept)│
│ Email Settings   ⚙️  │   │ Appraisals     (dept)│
└──────────────────────┘   │ Announcements  (dept)│
                           │ Team (Users)   (dept)│
   ⚙️ = admin-only,        └──────────────────────┘
      never shown to            no ⚙️ items —
      Team Lead                 no global settings
```

Key UI rules:
- **Team Lead never sees** Point Settings, Email Settings, Departments/Categories,
  the org-wide *All Tasks*, or org-wide AI insights. These items are simply
  filtered out of their sidebar.
- Team Lead's management pages reuse the **existing admin pages/components**
  (e.g. `AllTasksTable`, `AcceptanceRequestsPanel`, appraisals views) but the
  server query is filtered to `profiles.department = lead.department`.

### Scope cues on shared screens

So a Team Lead always knows they're seeing a slice, not the whole org:
- **Department banner** at the top of every Team page:
  `🟢 Showing the SEO department · 7 members`.
- **Dropdowns/filters** that list people (assign task, grant award, appraisals)
  are pre-filtered to dept members — no cross-dept names appear.
- Disabled/absent actions: destructive or global buttons (Delete project,
  Define award type, Change role) are **not rendered** for Team Leads (not just
  disabled), to avoid implying they're one click away.

### Admin user-management screen

Admin's user table (`components/admin/AdminClient.tsx`) gains a **Role**
dropdown with three options — `admin · team lead · member` — and a
**Department** column (required when role = `team_lead`, since the role is
meaningless without a department). Saving role = `team_lead` is the act that
"appoints" a department lead.

```
 Name            Department   Role        Status
 ───────────────────────────────────────────────────
 Asha R          SEO        [team lead ▾] Active
 Vikram P        SEO        [member    ▾] Active
 Neha S          Content    [team lead ▾] Active
 ───────────────────────────────────────────────────
        Role ▾ : admin / team lead / member   ← admin-only control
```

### Empty / permission states

- A Team Lead deep-linking to an admin-only URL (e.g. `/admin/email-settings`)
  hits the existing server-side role check and is **redirected to /dashboard**
  (same pattern as `app/(app)/admin/page.tsx:12`, extended to allow `team_lead`
  only on delegated pages).
- A Team Lead with **no department set** sees an inline notice on Team pages:
  *"No department assigned — ask an admin to set your department."* (Their
  authority derives entirely from `profiles.department`.)

---

## Phase-wise implementation plan

> **Status (as of build):** Phases 1–5 ✅ implemented and typecheck-clean.
> Phase 6 ✅ docs/seed/QA delivered (`qa-team-lead.md`,
> `supabase/seed_team_lead_demo.sql`, `AGENTS.md`); live end-to-end QA pending a
> running environment. Open policy item: appraisal-publish delegation (parked).

Six phases, ordered so the system is **never broken between phases**. Phases 1–2
are invisible to users (no one is `team_lead` yet); the role only becomes real
in Phase 5 when Admin can assign it.

### Phase 0 — Audit & finalise (no code)
- **Goal:** lock the matrix above; resolve the one open item (appraisal publish
  model — *parked*).
- **Deliverables:** approved `features.md` (this file).
- **Exit criteria:** sign-off on the admin-only list and dept-scoping rule.

### Phase 1 — Data model & RLS foundation
- **Goal:** make the database aware of `team_lead`, non-breaking.
- **Work:**
  - Migration `061_add_team_lead_role.sql`: `ALTER TYPE ... ADD VALUE 'team_lead'`.
  - Add RLS helpers `is_team_lead()` and `leads_user(target uuid)`
    (see *Implementation notes › B*).
- **Files:** `supabase/migrations/061_*.sql`, `types/` (extend `user_role`).
- **Exit criteria:** migration applies cleanly; existing admin/member behaviour
  unchanged; helpers return correct booleans in SQL tests.
- **Risk:** enum value adds are irreversible — review carefully.

### Phase 2 — API guard layer
- **Goal:** central, reusable authorization for the new role.
- **Work:** add to `lib/api.ts`:
  - `requireAdminOrTeamLead()` → returns profile (incl. `department`).
  - `requireManages(targetUserId)` → admin always; team lead iff same dept.
- **Files:** `lib/api.ts`.
- **Exit criteria:** unit-level checks: admin passes all; team lead passes own
  dept only; member blocked. **No routes changed yet** (still inert).

### Phase 3 — Delegate API routes (department-scoped)
- **Goal:** the delegated 🟡 features in the matrix accept Team Leads, scoped.
- **Work:** convert each delegated route from `requireAdmin()` →
  `requireManages(...)` / `requireAdminOrTeamLead()` **and** add a
  `department` filter to its query. Covers: task assign/approve, date-change
  approvals, attendance approve/edit, awards & bonus grant, appraisal
  draft/publish, dept announcements, projects/project-tasks, per-user
  recalculation, dept AI team-insights.
- **Leave on `requireAdmin()`:** the admin-only list (roles, user lifecycle,
  point-config, categories/departments, email-settings, award-types, cron,
  org-wide announcements, all-tasks, project delete).
- **Files:** routes under `app/api/admin/*`, `app/api/attendance/*`,
  `app/api/appraisals/*`, `app/api/projects/*`, `app/api/ai/team-insights`.
- **Exit criteria:** with a manually-flipped test user, Team Lead can act on
  own dept via API and is 403'd cross-dept and on admin-only routes.

### Phase 4 — Delegate admin pages + scope queries
- **Goal:** Team Leads can reach delegated pages in the UI, seeing only their dept.
- **Work:** change page-level guards from `role !== 'admin'` →
  `allow admin OR team_lead` on delegated pages; filter their server queries by
  department; keep admin-only pages gated to `admin`.
- **Files:** delegated pages under `app/(app)/admin/*` (all-tasks stays admin),
  appraisals, attendance, pending-approvals, announcements, monthly-tasks.
- **Exit criteria:** delegated pages render dept-scoped data for a Team Lead;
  admin-only pages redirect Team Leads to `/dashboard`.

### Phase 5 — Navigation & role UI
- **Goal:** the role is now assignable and visually distinct.
- **Work:**
  - `Sidebar.tsx`: replace `adminOnly`/`memberOnly` with `roles[]`; add Team
    Lead hybrid nav + "Team" section; add teal badge with department; update the
    `SidebarProps` `role` type to include `team_lead`.
  - `AdminClient.tsx`: add Role dropdown (3 options) + Department column; wire to
    the (admin-only) update-role route.
  - Add department banners / scope cues described in *UI › Scope cues*.
- **Files:** `components/shared/Sidebar.tsx`, `components/admin/AdminClient.tsx`,
  shared banner component.
- **Exit criteria:** Admin can promote a member to Team Lead of a department;
  that user's sidebar and badge reflect the new role on next load.

### Phase 6 — QA, seed & docs
- **Goal:** verify the whole matrix end-to-end and ship.
- **Work:**
  - Test grid: for each matrix row, assert Admin / Team Lead (own dept) /
    Team Lead (other dept) / Member outcomes.
  - Seed a demo Team Lead per department for staging.
  - Update `AGENTS.md` / onboarding notes with the 3-role model.
- **Exit criteria:** every ✅/🟡/❌ cell in the matrix behaves as specified at
  **both** the API and RLS layers; no Team Lead can reach any admin-only feature.

### Dependency order
```
Phase 0 ─▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─┐
                                          ├─▶ Phase 5 ─▶ Phase 6
                              Phase 4 ────┘
```
Phases 3 and 4 can proceed in parallel after Phase 2; Phase 5 (UI) needs both;
Phase 6 closes out.
