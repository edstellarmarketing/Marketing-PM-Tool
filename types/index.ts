export type Role = 'admin' | 'member'

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
