import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AnnouncementForm from '@/components/admin/AnnouncementForm'

export const dynamic = 'force-dynamic'

export default async function NewAnnouncementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const [awardsRes, profilesRes, categoriesRes, configsRes] = await Promise.all([
    admin.from('award_types').select('id, name, icon, bonus_points').eq('is_active', true).order('name'),
    admin.from('profiles').select('id, full_name, department, role').eq('is_active', true).order('full_name'),
    admin.from('categories').select('name').order('name'),
    admin.from('point_config')
      .select('label, category')
      .or('config_key.like.task_type_%,config_key.like.complexity_easy,config_key.like.complexity_medium,config_key.like.complexity_difficult')
      .order('config_key'),
  ])

  const allProfiles = profilesRes.data ?? []
  const departments = Array.from(
    new Set((allProfiles.map(p => p.department?.trim()).filter(Boolean) as string[])),
  ).sort()
  const members = allProfiles
    .filter(p => p.role !== 'admin')
    .map(p => ({ id: p.id, full_name: p.full_name, department: p.department ?? null }))

  const taskTypes = (configsRes.data ?? []).filter(c => c.category === 'task_type').map(c => c.label)
  const complexities = (configsRes.data ?? []).filter(c => c.category === 'complexity').map(c => c.label)
  const categories = (categoriesRes.data ?? []).map(c => c.name).filter(Boolean)

  return (
    <div className="space-y-3">
      <Link href="/admin/announcements" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600">
        <ArrowLeft size={14} /> Announcements
      </Link>
      <AnnouncementForm
        mode="create"
        awards={awardsRes.data ?? []}
        departments={departments}
        members={members}
        taskTypes={taskTypes}
        complexities={complexities}
        categories={categories}
      />
    </div>
  )
}
