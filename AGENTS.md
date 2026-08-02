<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roles & authorization

Three roles (`profiles.role`): **admin**, **team_lead**, **member**. A team lead
is scoped to their own `profiles.department`. Full matrix + design in
`features.md`; QA checklist in `qa-team-lead.md`.

**Authorization layers — use both:**
- **API routes:** guard with helpers from `lib/api.ts`:
  - `requireAdmin()` — system-wide / admin-only features (point config, categories,
    email settings, award types, cron, org score recalc, project delete,
    appraisal publish).
  - `requireAdminOrTeamLead()` — delegated list/management routes; returns the
    profile so you can scope queries by `profile.department` (use
    `departmentUserIds()` for an `.in('user_id', …)` filter).
  - `requireManages(targetUserId)` / `canManage(profile, targetUserId)` — acting
    on a specific user (admin = anyone; team lead = own department).
  - `canManageProject(profile, projectId)` — admin or project creator.
- **DB (RLS):** SQL mirrors live in migrations — `is_admin()`, `is_team_lead()`,
  `manages_user()`, `my_department()`.
- **Pages (server components):** guard with `requirePageRole([...])`.

**When adding a feature, decide first:** admin-only, or delegated to team leads
(department-scoped)? Default sensitive/global/destructive actions to admin-only.

Note: `projects` + `appraisals` RLS is admin-only (migration 056); team-lead
access there is enforced in the route handler with the service-role client (the
established `/api/admin/*` pattern), not RLS.

# Hidden modules

Some modules sit **outside** the role matrix entirely. Access comes only from a
row in `module_access` (migration 071) — **an admin does not get in by being an
admin**. Currently one module: `expenses` (`ModuleKey` in `types/index.ts`).

**Two roles within a grant** (`module_access.role`, migration 075):
`viewer` reads everything and changes nothing; `manager` adds, edits and deletes
entries and maintains the lookups. The grantor account is always treated as a
manager. Neither role can grant access or touch the public link / email settings.

- **Guards** (`lib/api.ts`):
  - `getModuleAccess(key)` for pages — returns `null` instead of throwing, so the
    page renders "No access" rather than a redirect.
  - `requireModuleAccess(key)` for read routes, `requireModuleManager(key)` for
    anything that writes, `requireModuleGrantor(key)` for grant/link/email admin.
  - `hasModuleAccess(userId, key)` / `moduleRole(userId, key)` for a bare check.
  - SQL mirrors: `has_module_access(key)`, `has_module_manage(key)`.
- **API denials are 404, never 403, for people with no grant** — the status code
  *is* the concealment. Don't "improve" those into descriptive errors. A *viewer*
  attempting a write is a different case and does get a readable 403: they know
  the module exists, so the honest message is more useful than a fake 404.
- **Pages show a "No access" screen**, not a 404 and not a `/dashboard` redirect —
  the only way to reach one is a link someone shared, so say so plainly.
- **Granting** is restricted to a single account (`MODULE_GRANTOR_EMAIL`, default
  `vijay@edstellar.com`), enforced by `requireModuleGrantor(key)`. Not any admin:
  otherwise an admin could add themselves.
- `module_access` is unreadable by the `authenticated` role (RLS on, no policies,
  no grant). Reach it only via the service-role client in a route handler.

**Sidebar:** a hidden module MAY have a nav entry, but only for people holding a
grant — `app/(app)/layout.tsx` resolves access server-side and passes a flag to
`Sidebar.tsx`. Never render the entry and let the page reject the click; that
tells everyone the module exists.

**When touching a hidden module, do not:** surface its rows through
`/api/search`; write its data into `tasks` (global search reads that table); or
reference it from dashboards, notifications, or emails that non-grant-holders
receive.

**Public report:** `expenses` publishes a tokenised, no-login report at
`/expense-report/<token>` (`expense_public_report`, single row, revocable and
rotatable). It is **read-only and deliberately complete** — all years plus the
full ledger and subscriptions — so treat the token as public. It excludes
Settings and soft-deleted rows, sends `noindex`, and must never carry
credentials: the importer drops the source workbooks' password columns and no
column should reintroduce them.
