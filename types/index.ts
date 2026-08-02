export type Role = 'admin' | 'team_lead' | 'member'

// Slug of a hidden module (migration 071). Hidden modules sit outside the Role
// matrix: access comes only from an explicit `module_access` row, so an admin
// does not get in by being an admin. A literal union on purpose — a typo'd key
// must fail at compile time, not silently deny access at runtime.
export type ModuleKey = 'expenses'

export interface ModuleAccess {
  id: string
  user_id: string
  module_key: ModuleKey
  granted_by: string | null
  granted_at: string
  note: string | null
}

// ─── Expenses module (hidden; migration 072) ─────────────────────────────────
// Mirrors the SQL enums. Keep in step with the migration — these unions are the
// only compile-time check that a value is legal.

export type ExpensePaymentStatus = 'paid' | 'pending' | 'refunded' | 'free'
export type ExpensePaymentMethod = 'auto_pay' | 'manual' | 'link_exchange'
export type ExpenseBillingCycle = 'monthly' | 'yearly' | 'credits' | 'one_time' | 'custom'
export type ExpenseSubscriptionStatus = 'active' | 'cancelled' | 'expired'
// 'text_mention' covers the source sheet's "No Link" and "No Hyperlink" — an
// unlinked brand mention.
export type ExpenseLinkRel = 'dofollow' | 'nofollow' | 'text_mention'

// Every expense lookup has the same shape. `is_active` retires an entry without
// deleting it, so historical rows pointing at it still resolve.
export interface ExpenseLookup {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface ExpenseCategory extends ExpenseLookup {
  slug: string
  sort_order: number
}

// The five lookups a form or filter bar needs, fetched in one call.
export interface ExpenseLookups {
  categories: ExpenseCategory[]
  teams: ExpenseLookup[]
  verticals: ExpenseLookup[]
  vendors: ExpenseLookup[]
  backlinkTypes: ExpenseLookup[]
}

// Category-specific fields. Deliberately loose: `meta` is the long tail that
// only matters to one category. Promote a key to a real column once it needs
// filtering or aggregation. Never credentials.
export interface ExpenseMeta {
  // Paid Links / HARO Links
  da?: number
  pa?: number
  ss?: number
  traffic?: string
  da_range?: string
  target_page?: string
  target_keyword?: string
  semrush_detected?: boolean
  search_console_detected?: boolean
  // GMB Review
  reviews_count?: number
  // Paid Ads — historical rows are campaign × month aggregates, so the original
  // period is preserved even though expense_date is a single day.
  campaign?: string
  campaign_status?: string
  ad_strategy?: string
  period_start?: string
  period_end?: string
  // Content Writer
  article_title?: string
  article_cluster?: string
  contract_status?: string
  article_status?: string
  doc_url?: string
  live_url?: string
  // Courses
  course_name?: string
  set?: string
  [key: string]: unknown
}

export interface ExpenseSubscription {
  id: string
  name: string
  vendor_id: string | null
  billing_cycle: ExpenseBillingCycle
  // List price PER CYCLE — never sum this across rows with different cycles.
  amount_usd: number | null
  started_on: string | null
  ends_on: string | null
  payment_method: ExpensePaymentMethod | null
  status: ExpenseSubscriptionStatus
  owner_profile_id: string | null
  owner_name: string | null
  team_id: string | null
  seats: number | null
  invoice_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface Expense {
  id: string
  expense_date: string
  // Net of tax. `tax_usd` null means "not recorded", not "zero tax".
  amount_usd: number
  tax_usd: number | null
  // Generated in SQL: amount_usd + coalesce(tax_usd, 0). Read-only.
  total_usd: number
  initial_price_usd: number | null
  category_id: string
  backlink_type_id: string | null
  vendor_id: string | null
  subscription_id: string | null
  team_id: string | null
  vertical_id: string | null
  link_url: string | null
  link_site: string | null
  link_rel: ExpenseLinkRel | null
  // Generated in SQL from link_site/link_url. Read-only; powers duplicate
  // detection, and is normalised identically for the form and the importer.
  link_domain: string | null
  payee: string | null
  // Who sourced it internally. The backlinks sheet's "Team" column is people,
  // not teams — it lands here, never on team_id.
  acquired_by: string | null
  country: string | null
  payment_status: ExpensePaymentStatus
  payment_method: ExpensePaymentMethod | null
  invoice_url: string | null
  description: string | null
  notes: string | null
  meta: ExpenseMeta
  // Null once the entering account is removed — the row survives, the
  // attribution does not.
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

// One row of the dashboard's month × category matrix
// (view `expense_monthly_totals`).
export interface ExpenseMonthlyTotal {
  year: number
  month: number
  category_id: string
  category_name: string
  category_sort_order: number
  net_usd: number
  tax_usd: number
  total_usd: number
  entry_count: number
}

// Duplicate-warning payload (expenses.md §6.3). Advisory only — the form warns
// and still saves.
export interface ExpenseDuplicateMatch {
  id: string
  expense_date: string
  amount_usd: number
  link_url: string | null
  link_domain: string | null
  vertical_name: string | null
  backlink_type_name: string | null
  created_by_name: string | null
}

export interface ExpenseDuplicates {
  exact: ExpenseDuplicateMatch[]
  domain: ExpenseDuplicateMatch[]
}

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'

export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected'

export type TaskType = string

export type Complexity = string

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

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  role: Role
  department: string | null
  designation: string | null
  joining_date: string | null
  is_active: boolean
  created_at: string
}

export interface SubTask {
  id: string
  title: string
  completed: boolean
  due_date?: string | null
}

export interface Task {
  id: string
  user_id: string
  plan_id: string | null
  goal_id: string | null
  title: string
  description: string | null
  category: string | null
  priority: Priority
  status: TaskStatus
  task_type: TaskType | null
  complexity: Complexity | null
  start_date: string | null
  due_date: string | null
  completion_date: string | null
  score_weight: number   // auto-calculated potential (task_type × complexity)
  score_earned: number   // auto-calculated on close
  subtasks: SubTask[] | null
  approval_status: ApprovalStatus
  is_draft: boolean
  strategic_notes: string | null
  approved_by: string | null
  approved_at: string | null
  approval_note: string | null
  assigned_by: string | null
  parent_task_id: string | null
  scoring_locked: boolean
  source_announcement_id: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface TaskUpdate {
  id: string
  task_id: string
  user_id: string
  old_status: string | null
  new_status: string
  note: string | null
  created_at: string
}

export interface MonthlyPlan {
  id: string
  user_id: string
  month: number
  year: number
  goals: Goal[]
  created_at: string
}

export type GoalType = 'one_time' | 'checklist'
export type ChecklistItemStatus = 'todo' | 'in_progress' | 'done'

export interface ChecklistItem {
  id: string
  title: string
  status: ChecklistItemStatus
}

export type GoalApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected'

export interface Goal {
  id: string
  title: string
  target_metric: string | null
  category: string | null
  score_weight: number
  progress: number
  type?: GoalType
  checklist?: ChecklistItem[]
  approval_status?: GoalApprovalStatus
  approval_note?: string | null
}

export interface MonthlyScore {
  id: string
  user_id: string
  month: number
  year: number
  total_tasks: number
  completed_tasks: number
  score_earned: number
  score_possible: number
  completion_rate: number
  bonus_points: number
  rank: number | null
  created_at: string
}

export interface AwardType {
  id: string
  name: string
  description: string | null
  icon: string
  bonus_points: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UserAward {
  id: string
  user_id: string
  award_type_id: string
  task_id: string | null
  awarded_by: string
  note: string | null
  bonus_points: number
  month: number
  year: number
  created_at: string
  award_types?: AwardType
  tasks?: { id: string; title: string } | null
  profiles?: { id: string; full_name: string; avatar_url: string | null }
}

export interface AppraisalSnapshot {
  id: string
  user_id: string
  financial_year: string
  total_score: number
  award_bonus: number
  avg_monthly_score: number
  peak_month: string | null
  ai_summary: string | null
  ai_strengths: string[] | null
  ai_areas_of_improvement: string[] | null
  ai_development_roadmap: string[] | null
  ai_attendance_insight: string | null
  published: boolean
  published_at: string | null
  created_at: string
}

export interface CategoryStat {
  category: string
  score_earned: number
  score_possible: number
  completion_rate: number
  task_count: number
}

export interface PerformanceSummary {
  id: string
  user_id: string
  financial_year: string
  total_score: number
  avg_monthly_score: number
  peak_month: string | null
  summary: string | null
  strengths: string[] | null
  growth_areas: string[] | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  read: boolean
  created_at: string
  link?: string | null
  sender_id?: string | null
  sender?: { full_name: string; avatar_url: string | null } | null
}

export interface Category {
  id: string
  name: string
  created_at: string
}

export interface MeetingNoteTimeline {
  label: string
  date?: string | null
}

export interface MeetingNote {
  id: string
  user_id: string
  title: string
  meeting_date: string
  goal: string
  body: string | null
  timelines: MeetingNoteTimeline[]
  met_with: string | null
  created_at: string
  updated_at: string
}

export type LeaveType = 'sick' | 'casual'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface AttendanceLeave {
  id: string
  user_id: string
  date: string
  leave_type: LeaveType
  is_half_day: boolean
  status: LeaveStatus
  note: string | null
  created_at: string
}

export interface AttendanceMonthSummary {
  month: number
  year: number
  sick_days: number
  casual_days: number
  total_days: number
  is_perfect: boolean
  bonus_awarded: boolean
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
export type ProjectTaskStatus = 'pending' | 'in_progress' | 'completed'
export type ProjectDomain = 'Edstellar' | 'Invensis'
export const PROJECT_DOMAINS: readonly ProjectDomain[] = ['Edstellar', 'Invensis']

export interface Project {
  id: string
  name: string
  domain: ProjectDomain | null
  description: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  color: string | null
  notify_email_enabled: boolean
  notify_owner_email_enabled: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface ProjectDocument {
  id: string
  project_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  // Populated by the API when listing — short-lived signed URL to open the file.
  viewUrl?: string | null
}

export interface ProjectTaskGroup {
  id: string
  project_id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  owner_id: string | null
  group_id: string | null
  title: string
  description: string | null
  category: string | null
  priority: Priority
  status: ProjectTaskStatus
  progress: number
  assignee_id: string | null
  start_date: string | null
  due_date: string | null
  dependency_task: string | null
  dependency_details: string | null
  dependency_status: string | null
  dependency_owner: string | null
  dependency_owner_id: string | null
  dependency_owner_ids?: string[] | null
  final_comments: string | null
  sort_order: number | null
  created_by: string
  created_at: string
  updated_at: string
  assignee?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export interface ProjectOwner {
  id: string
  project_id: string
  user_id: string
  department: string
  created_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  members?: ProjectOwnerMember[]
}

export interface ProjectOwnerMember {
  id: string
  owner_id: string
  user_id: string
  created_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export type DateChangeRequestStatus = 'pending' | 'approved' | 'rejected'

export interface TaskDateChangeRequest {
  id: string
  task_id: string
  requested_by: string
  current_start_date: string | null
  current_due_date: string | null
  requested_start_date: string | null
  requested_due_date: string | null
  reason: string | null
  status: DateChangeRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}
