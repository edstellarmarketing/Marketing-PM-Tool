# Pending Approvals Page Plan

## Goal

Move admin approval work out of the main `/admin` dashboard and into a dedicated left-menu page called **Pending Approvals**.

The new page should show all pending admin approval items in one tabular view with:

- Type of request
- Who requested it
- When it was requested
- Request details
- Comment input
- Approve and reject actions

The current approval widgets should be removed from the admin dashboard:

- `Pending Task Approvals`
- `Date Change Requests`

## Current State

### Admin dashboard

File: `app/(app)/admin/page.tsx`

The page currently imports and renders:

- `PendingApprovalsPanel` from `components/admin/PendingApprovalsPanel.tsx`
- `DateChangeRequestsPanel` from `components/admin/DateChangeRequestsPanel.tsx`

These sections appear below the team grid and show empty-state messages:

- `No completions pending approval.`
- `No date change requests pending.`

### Existing task completion approvals

Client component:

- `components/admin/PendingApprovalsPanel.tsx`

Read endpoint:

- `GET /api/admin/tasks/pending`
- File: `app/api/admin/tasks/pending/route.ts`

Current query:

- Reads from `tasks`
- Filters `approval_status = 'pending_approval'`
- Filters `status = 'done'`
- Joins `profiles(full_name, avatar_url)`
- Orders by `updated_at desc`

Action endpoint:

- `PATCH /api/admin/tasks/[id]/approve`
- File: `app/api/admin/tasks/[id]/approve/route.ts`

Current action body:

```json
{
  "action": "approved",
  "note": "Optional admin comment"
}
```

Supported actions:

- `approved`: confirms the score
- `rejected`: returns the task to `in_progress`, clears completion date, and clears earned score

### Existing date change approvals

Client component:

- `components/admin/DateChangeRequestsPanel.tsx`

Read endpoint:

- `GET /api/admin/date-change-requests`
- File: `app/api/admin/date-change-requests/route.ts`

Current query:

- Reads from `task_date_change_requests`
- Filters `status = 'pending'`
- Joins task details
- Joins requester profile
- Orders by `created_at desc`

Action endpoint:

- `PATCH /api/admin/date-change-requests/[id]`
- File: `app/api/admin/date-change-requests/[id]/route.ts`

Current action body:

```json
{
  "action": "approved",
  "note": "Optional admin comment"
}
```

Supported actions:

- `approved`: applies requested dates to the task and marks the request approved
- `rejected`: marks the request rejected without changing task dates

## Proposed UX

### Left menu

Add a new admin-only item in `components/shared/Sidebar.tsx`:

- Label: `Pending Approvals`
- Href: `/admin/pending-approvals`
- Suggested icon: `ClipboardCheck`, `Inbox`, or `BadgeCheck` from `lucide-react`

Recommended order:

1. Admin
2. Pending Approvals
3. Appraisals
4. Point Settings

### Admin dashboard cleanup

Update `app/(app)/admin/page.tsx`:

- Remove imports for `PendingApprovalsPanel` and `DateChangeRequestsPanel`
- Remove the two card sections that render those panels
- Keep team stats, team grid, category management, AI insights, and blocked tasks

Optional: add a small stat card or link to the Pending Approvals page later, but do not duplicate the full approval workflow on `/admin`.

### New page route

Create:

- `app/(app)/admin/pending-approvals/page.tsx`

The page should:

- Require the logged-in user to be an admin
- Redirect non-admin users to `/dashboard`
- Render a title: `Pending Approvals`
- Render a short summary row with counts by request type
- Render a client table component for the approval workflow

Recommended server-page pattern:

- Follow `app/(app)/admin/page.tsx` and `app/(app)/admin/settings/page.tsx`
- Use `createClient()` from `lib/supabase/server`
- Check profile role before rendering

### New table component

Create:

- `components/admin/PendingApprovalsTable.tsx`

This should be a client component because it needs loading state, comments, and approve/reject actions.

Columns:

- `Type`
- `Request`
- `Requested by`
- `Requested at`
- `Comment`
- `Actions`

Recommended type labels:

- `Task completion`
- `Date change`

For `Task completion`, the request details should include:

- Task title
- Task status
- Score or potential points
- Due date
- Task type and complexity if available

For `Date change`, the request details should include:

- Task title
- Current start date -> requested start date
- Current due date -> requested due date
- Request reason if provided

### Empty state

Use one unified empty state:

`No pending approvals.`

Do not show two separate empty states.

### Loading and processing states

The table should support:

- Initial loading state
- Per-row processing state
- Disabled approve/reject buttons while a row is processing
- Optimistic removal after successful action
- Error message if an action fails

Avoid one global processing flag because one action should not lock the full table unless bulk actions are added.

## Data Model for the UI

Use a normalized client-side shape:

```ts
type PendingApprovalType = 'task_completion' | 'date_change'

interface PendingApprovalRow {
  id: string
  type: PendingApprovalType
  title: string
  requestedBy: {
    id?: string
    fullName: string
    avatarUrl: string | null
  }
  requestedAt: string
  details: Record<string, unknown>
}
```

Mapping rules:

- Task completion `id` should be the task id
- Date change `id` should be the date change request id
- Task completion `requestedAt` should use `updated_at` because that is when the pending completion state was last set
- Date change `requestedAt` should use `created_at`

## API Options

### Recommended approach: add a unified read endpoint

Create:

- `app/api/admin/pending-approvals/route.ts`

`GET /api/admin/pending-approvals` should:

1. Call `requireAdmin()`
2. Query pending task completions
3. Query pending date change requests
4. Normalize both result sets into `PendingApprovalRow[]`
5. Sort all rows by `requestedAt desc`
6. Return:

```json
{
  "items": [],
  "counts": {
    "total": 0,
    "task_completion": 0,
    "date_change": 0
  }
}
```

Keep the existing action endpoints:

- `PATCH /api/admin/tasks/[id]/approve`
- `PATCH /api/admin/date-change-requests/[id]`

This avoids duplicating approval business logic and keeps the new page focused on orchestration and presentation.

### Alternative approach: fetch existing endpoints from the client

The table could call:

- `/api/admin/tasks/pending`
- `/api/admin/date-change-requests`

Then normalize and merge in the browser.

This is faster to implement, but less clean because every future approval type would require another client fetch and another client-side normalization path.

Use this only if implementation time is the top priority.

## Approval Actions

The table action handler should route by row type:

```ts
if (row.type === 'task_completion') {
  await fetch(`/api/admin/tasks/${row.id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, note }),
  })
}

if (row.type === 'date_change') {
  await fetch(`/api/admin/date-change-requests/${row.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, note }),
  })
}
```

Button labels:

- Task completion approve: `Approve`
- Task completion reject: `Reject`
- Date change approve: `Approve`
- Date change reject: `Reject`

Optional helper text or tooltip can clarify task completion rejection:

- `Rejecting returns the task to In Progress.`

## Comments

Each row should include a comment field.

Behavior:

- Comment is optional for approval
- Comment is optional for rejection unless product decides rejection should require an explanation
- Comment should be sent as `note`
- Task completion endpoint stores it in `tasks.approval_note`
- Date change endpoint stores it in `task_date_change_requests.review_note`
- Existing notification bodies already include the note when provided

Recommended validation:

- Max 2000 characters for date changes, matching the existing endpoint
- Add the same max to task approval UI even though the current task endpoint only uses `z.string().optional()`

## Files to Add

- `app/(app)/admin/pending-approvals/page.tsx`
- `components/admin/PendingApprovalsTable.tsx`
- `app/api/admin/pending-approvals/route.ts`

## Files to Update

- `app/(app)/admin/page.tsx`
- `components/shared/Sidebar.tsx`

Optional cleanup after migration:

- Remove `components/admin/PendingApprovalsPanel.tsx` if no longer used
- Remove `components/admin/DateChangeRequestsPanel.tsx` if no longer used

Keep the existing API endpoints because the new table should reuse them for actions.

## Implementation Steps

1. Read the relevant Next.js version docs in `node_modules/next/dist/docs/` before editing route handlers or app routes, per `AGENTS.md`.
2. Add `Pending Approvals` to the admin-only sidebar navigation.
3. Remove the two pending approval sections from `/admin`.
4. Add the unified `GET /api/admin/pending-approvals` endpoint.
5. Add the `/admin/pending-approvals` server page with admin guard.
6. Add `PendingApprovalsTable` with normalized rows, comments, approve/reject actions, and per-row processing state.
7. Verify that approving and rejecting task completions still updates tasks and notifications through the existing endpoint.
8. Verify that approving and rejecting date changes still updates request status, task dates when approved, and notifications through the existing endpoint.
9. Run the project checks:

```bash
npm run build
```

10. Manually test `/admin`, `/admin/pending-approvals`, and the sidebar active states.

## Acceptance Criteria

- `/admin` no longer displays `Pending Task Approvals`.
- `/admin` no longer displays `Date Change Requests`.
- The left menu shows `Pending Approvals` for admins.
- Non-admin users cannot access `/admin/pending-approvals`.
- `/admin/pending-approvals` shows one table containing pending task completions and pending date change requests.
- Each row shows request type, requester, requested date/time, details, comment input, approve button, and reject button.
- Approving a task completion confirms the task score.
- Rejecting a task completion returns the task to `in_progress`.
- Approving a date change applies the requested dates to the task.
- Rejecting a date change leaves the task dates unchanged.
- Successful actions remove the row from the table.
- Failed actions show a clear error without removing the row.
- Empty table shows one unified message: `No pending approvals.`

## Future Extension

If more approval types are added later, extend only:

- The unified read endpoint normalization
- The `PendingApprovalType` union
- The table details renderer
- The action router

Examples:

- Monthly plan goal approvals
- Appraisal publish approvals
- Score override approvals
