export type AnnouncementStatus = 'open' | 'active'

export interface AwardTypeRef {
  name: string
  icon: string
  bonus_points?: number
}

/** Shape returned by /api/announcements and /api/admin/announcements (list). */
export interface AnnouncementRow {
  id: string
  title: string
  description: string | null
  departments: string[]
  due_date: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  task_type: string | null
  complexity: string | null
  category: string | null
  award_type_id: string | null
  bonus_points: number
  score_weight: number | null
  status: AnnouncementStatus
  accepted_by: string | null
  accepted_at: string | null
  accepted_task_id: string | null
  created_by: string
  created_at: string
  expires_at: string
  award_types?: AwardTypeRef | null
}

/** Shape returned by /api/announcements/[id]/attachments. */
export interface AttachmentRow {
  id: string
  announcement_id?: string
  task_id?: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_by: string
  created_at: string
  viewUrl: string | null
}
