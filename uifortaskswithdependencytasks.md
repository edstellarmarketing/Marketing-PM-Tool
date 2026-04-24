# UI Plan: Enhanced Task Detail View for Tasks with Dependencies

This document outlines the plan to implement a specialized UI for tasks that have linked dependency tasks (child tasks). The goal is to provide a comprehensive, hierarchical view that allows users to monitor and manage parent tasks and their dependencies effectively.

## 1. Research & Current State
- **Current implementation:** `app/(app)/tasks/[id]/page.tsx` fetches child tasks but only displays a warning message if they are pending.
- **Data Model:** Tasks are linked via `parent_task_id`.
- **Existing Logic:** `TaskDetailDrawer.tsx` already has logic to fetch and display children, but in a simplified list format.

## 2. UI/UX Strategy: "The Dependency Dashboard"

When a task has dependencies, the detail page will transform into a "Dependency Dashboard".

### A. Summary Header (Professional Improvement)
- **Progress Track:** A visual progress bar showing the percentage of dependencies completed vs. total.
- **Blocking Status:** Clear indicator if the parent task is currently "Blocked" by pending dependencies.
- **Aggregate Stats:** Total potential score of all dependencies vs. current earned score.

### B. Parent Task Details
- Maintain the existing core details (Title, Description, Category, Priority, Strategic Notes).
- Condensed view to save vertical space for the dependency list.

### C. Dependency Accordions
Each child task will be rendered within an accordion for a clean, organized look.

**Accordion Header:**
- Task Title.
- Assignee Avatar/Name.
- Status Badge (Color-coded).
- Due Date (Highlight if overdue).
- Quick Action: "Approve" button (if task is done and awaiting approval).

**Accordion Content:**
- Full Description.
- Score Breakdown (Base × Type × Complexity).
- Subtasks checklist (if any).
- Update History (Condensed).
- "View Full Task" link.

## 3. Implementation Plan

### Phase 1: Data Fetching Enhancement
Modify `app/(app)/tasks/[id]/page.tsx` to fetch more comprehensive data for children:
```typescript
const [{ data: task }, { data: pointConfigRows }, { data: childRows }] = await Promise.all([
  supabase.from('tasks').select('*, task_updates(*), profiles:user_id(full_name, avatar_url)').eq('id', id).single(),
  supabase.from('point_config').select('config_key,config_value,label'),
  supabase.from('tasks').select('*, profiles:user_id(full_name, avatar_url)').eq('parent_task_id', id),
])
```

### Phase 2: Component Architecture
1. **`DependencyProgress`**: New component to show the visual progress of the dependency tree.
2. **`DependencyAccordion`**: A reusable component for rendering child tasks.
3. **`TaskDetailView` (Parent)**: Refactored existing detail view to be more modular.

### Phase 3: Layout Updates
- Introduce a layout switch: If `childRows.length > 0`, use the "Dependency Dashboard" layout.
- Otherwise, stick to the standard task detail layout.

## 4. Professional Improvements & Refinements

1. **Interactivity:**
   - Smooth transitions for opening/closing accordions.
   - Real-time updates when a dependency is approved (using optimistic UI or refresh).
2. **Visual Hierarchy:**
   - Use subtle indentation or border treatments to distinguish children from the parent.
   - Use icons to denote the "Parent" vs "Child" relationship.
3. **Accessibility:**
   - Ensure accordions are keyboard navigable.
   - Use ARIA labels for status indicators.
4. **Conditional Actions:**
   - Only show the "Approve" button to the parent task's owner or admins.
   - Disable the parent's "Mark as Done" button until all children are `approved`.

## 5. Component Mockup: Dependency Accordion

Since the project doesn't have a standard Accordion component, we will implement a lightweight, accessible version using Tailwind CSS and React state.

```tsx
// Proposed structure for DependencyAccordion.tsx
export function DependencyAccordion({ task, onApprove }: { task: Task; onApprove: (id: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white mb-3 shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <ChevronRight size={18} className={cn("text-gray-400 transition-transform", isOpen && "rotate-90")} />
          <div className="text-left">
            <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", statusStyles[task.status])}>
                {task.status}
              </span>
              <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                <User size={10} /> {task.profiles?.full_name}
              </span>
            </div>
          </div>
        </div>
        
        {/* Quick Action Button */}
        {task.status === 'done' && task.approval_status === 'pending_approval' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onApprove(task.id); }}
            className="px-3 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700"
          >
            Approve
          </button>
        )}
      </button>

      {isOpen && (
        <div className="px-12 pb-4 border-t border-gray-100 bg-gray-50/50">
          <div className="pt-4 space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
            
            <div className="grid grid-cols-2 gap-4">
               {/* Reusable child components from standard TaskDetail */}
               <ScoreBreakdown task={task} />
               <SubtasksList subtasks={task.subtasks} />
            </div>
            
            <Link 
              href={`/tasks/${task.id}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
            >
              View Full Task Details <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

## 6. Success Criteria
- [ ] Users can see the full context of a project (parent task) and its parts (dependencies) in one view.
- [ ] The "Blocked" status of a parent task is visually obvious.
- [ ] Dependencies can be approved directly from the parent view without navigating away.
- [ ] The UI remains responsive and clean even with many dependencies.
