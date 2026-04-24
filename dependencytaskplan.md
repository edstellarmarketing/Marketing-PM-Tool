# Implementation Plan: Dependency Tasks

## 1. Overview
The goal is to allow users to create a "Main Task" for themselves and link "Dependency Tasks" assigned to other users. The Main Task can only be completed once all linked Dependency Tasks are marked as `done`. Dependency tasks follow the same scoring and point rules as regular tasks for the users assigned to them.

---

## 2. Database Schema Changes
A self-referencing foreign key is needed in the `tasks` table.

- **Table**: `Marketing-PM-Tool.tasks`
- **New Column**: `parent_task_id` (UUID, nullable)
- **Constraint**: Foreign Key referencing `Marketing-PM-Tool.tasks(id)` ON DELETE CASCADE (or SET NULL, depending on preference. CASCADE is safer for cleanup).

### SQL Migration
```sql
ALTER TABLE "Marketing-PM-Tool".tasks 
ADD COLUMN parent_task_id uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE CASCADE;

-- Optional: Index for performance
CREATE INDEX idx_tasks_parent_id ON "Marketing-PM-Tool".tasks(parent_task_id);
```

---

## 3. API Enhancements

### `POST /api/tasks`
Update the creation API to support adding dependencies in a single request.
- **Payload Update**:
  ```json
  {
    "title": "Main Task Title",
    "dependencies": [
      {
        "title": "Dependency 1",
        "user_id": "uuid-of-other-user",
        "due_date": "2023-12-01",
        "task_type": "...",
        "complexity": "..."
      }
    ]
  }
  ```
- **Logic**:
  1. Create the Main Task.
  2. Create all Dependency Tasks with `parent_task_id` set to the Main Task's ID.
  3. Ensure regular users can assign dependency tasks to others (this bypasses the current admin-only restriction for assignment, but only in the context of dependencies).

### `PATCH /api/tasks/[id]`
Update the status change logic.
- **Validation**: If a task is being moved to `done` or `review`:
  1. Check if it has any children tasks (`parent_task_id = current_id`).
  2. If children exist, check if all of them have `status = 'done'`.
  3. If any dependency is not done, return a `403 Forbidden` error: `"Cannot complete task until all dependencies are finished."`

---

## 4. UI/UX Updates

### Task Detail View (`components/plans/TaskDetailDrawer.tsx`)
- Add a new section: **"Linked Dependencies"**.
- Display a list of tasks where `parent_task_id` is the current task's ID.
- Show each dependency's:
  - Title
  - Assignee (Avatar + Name)
  - Status (Badge)
  - Due Date
- Add a button: **"Add Dependency"**.
  - Opens a small form to select a user, set a title, and choosing task type/complexity.

### Dependency Creation Form
A new component or section within the drawer to:
- Search and select a team member.
- Define task details.
- Calculate preview points (using existing `ScoringClassification` logic).

### Task List Indicators
- In `PlanningTable` and `TaskListClient`, add an icon (e.g., `Link` or `Layers`) next to tasks that have dependencies.
- Show a tooltip or count: `"3 dependencies (1 pending)"`.

---

## 5. Approval Logic & Roles

### Dependency Tasks (Assigned to others)
- **Status Approval**: When a dependency task is marked `done`, it enters `pending_approval` but is **hidden from the Admin's standard approval queue**.
- **Who Approves?**: The **Owner of the Main Task** (the user who created the dependency).
- **Logic**: The Main Task owner acts as the "Project Manager" for their dependencies. 
  - They review the work submitted by the dependent user.
  - They approve the completion and the **score earned**.
  - Once approved by the owner, the dependent user's points are confirmed and reflected in the leaderboard/scores.

### Main Task (Assigned to self)
- **Status Approval**: Can only be moved to `done` after all linked dependencies are `approved` by the Main Task owner.
- **Who Approves?**: **Admins**.
- **Logic**: Admins provide the final verification. When reviewing a Main Task, the Admin panel will display a summary: *"3 Dependencies approved by [User A]"*. This allows the Admin to provide high-level oversight without micro-managing every sub-task.

---

## 6. Manipulation Risks & Mitigation

### Risk 1: Mutual Point Padding (The "You scratch my back" risk)
*Scenario*: User A creates fake dependencies for User B and approves them instantly so User B gets easy points.
- **Mitigation**: 
  - **Admin Rollup Audit**: When User A submits their Main Task, the Admin reviews the *entire tree*. If the dependencies approved by User A are found to be low-quality or fake, the Admin can reject the Main Task and trigger a manual score adjustment for User B.
  - **Approval History**: A dedicated Admin view shows "Approval Volume per User." If User A is approving an unusually high amount of points for others, it is flagged for review.

### Risk 2: Strategic Delay
*Scenario*: User A refuses to approve User B's work to keep User B's score low or hold the project hostage.
- **Mitigation**:
  - **Admin Override**: Admins retain the "Super-Approve" capability. If a dependency is stuck in "Pending Review" for too long, the dependent user can flag it, and an Admin can approve it directly.

### Risk 3: Complexity Inflation
*Scenario*: User A assigns a "Critical" complexity to a "Low" complexity dependency for User B.
- **Mitigation**:
  - **Point Config Validation**: The system restricts dependency classification to a pre-set list. Admins audit these classifications during the Main Task review phase.

---

## 7. Scoring Logic
- **Main Task**: Earns points for the creator when completed and approved.
- **Dependency Tasks**: Earn points for the assigned users when completed and approved.
- No changes needed to the core scoring engine (`lib/scoring.ts`) as long as dependency tasks are treated as regular tasks in the database.

---

## 8. Notifications
- When a dependency task is created: Notify the assignee.
- When a dependency task is completed: Notify the owner of the Main Task.

---

## 9. Edge Cases & Constraints
1. **Circular Dependencies**: Prevented by the hierarchical UI (you add dependencies *to* a task).
2. **Deletion**: Deleting a Main Task should ideally delete its dependencies (via `CASCADE`) or prompt the user.
3. **Admin Assignment**: Admins should see dependencies in the Admin User View.
