import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AnnouncementForm from '@/components/admin/AnnouncementForm'
import { signMany } from '@/lib/attachments'

export const dynamic = 'force-dynamic'

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const [announcementRes, awardsRes, profilesRes, categoriesRes, configsRes, attachmentsRes] = await Promise.all([
    admin.from('announcements').select('*').eq('id', id).single(),
    admin.from('award_types').select('id, name, icon, bonus_points').eq('is_active', true).order('name'),
    admin.from('profiles').select('department').eq('is_active', true),
    admin.from('categories').select('name').order('name'),
    admin.from('point_config')
      .select('label, category')
      .or('config_key.like.task_type_%,config_key.like.complexity_easy,config_key.like.complexity_medium,config_key.like.complexity_difficult')
      .order('config_key'),
    admin.from('announcement_attachments').select('id, file_name, storage_path, size_bytes, mime_type, created_at, uploaded_by').eq('announcement_id', id).order('created_at'),
  ])

  if (!announcementRes.data) notFound()

  if (announcementRes.data.status === 'active') {
    // Active announcements can't be edited; bounce to detail.
    redirect(`/admin/announcements/${id}`)
  }

  const departments = Array.from(
    new Set(((profilesRes.data ?? []).map(p => p.department?.trim()).filter(Boolean) as string[])),
  ).sort()
  const taskTypes = (configsRes.data ?? []).filter(c => c.category === 'task_type').map(c => c.label)
  const complexities = (configsRes.data ?? []).filter(c => c.category === 'complexity').map(c => c.label)
  const categories = (categoriesRes.data ?? []).map(c => c.name).filter(Boolean)

  // Sign URLs for the existing attachments so the uploader can render them.
  const paths = (attachmentsRes.data ?? []).map(a => a.storage_path)
  const signed = await signMany('announcement-attachments', paths)
  const preloaded = (attachmentsRes.data ?? []).map(a => ({
    id: a.id,
    file_name: a.file_name,
    viewUrl: signed[a.storage_path] ?? null,
    size_bytes: a.size_bytes,
    created_at: a.created_at,
    uploaded_by: a.uploaded_by,
  }))

  return (
    <div className="space-y-3">
      <Link href={`/admin/announcements/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600">
        <ArrowLeft size={14} /> Back to announcement
      </Link>
      <AnnouncementForm
        mode="edit"
        initial={{
          id,
          title: announcementRes.data.title,
          description: announcementRes.data.description,
          departments: announcementRes.data.departments,
          due_date: announcementRes.data.due_date,
          priority: announcementRes.data.priority,
          task_type: announcementRes.data.task_type,
          complexity: announcementRes.data.complexity,
          category: announcementRes.data.category,
          award_type_id: announcementRes.data.award_type_id,
          bonus_points: announcementRes.data.bonus_points,
          score_weight: announcementRes.data.score_weight,
        }}
        awards={awardsRes.data ?? []}
        departments={departments}
        taskTypes={taskTypes}
        complexities={complexities}
        categories={categories}
        preloadedAttachments={preloaded}
      />
    </div>
  )
}
