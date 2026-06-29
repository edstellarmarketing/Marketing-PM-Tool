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
