import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EmailSettingCard from '@/components/admin/EmailSettingCard'

export const dynamic = 'force-dynamic'

export default async function EmailSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const adminClient = createAdminClient()

  const [{ data: settingRows }, { data: memberProfiles }] = await Promise.all([
    adminClient.from('email_settings').select('key, enabled, send_time'),
    adminClient.from('profiles').select('id, full_name').eq('role', 'member').eq('is_active', true).order('full_name'),
  ])

  const settings: Record<string, { enabled: boolean; send_time: string }> = {}
  for (const row of settingRows ?? []) {
    settings[row.key] = { enabled: row.enabled, send_time: row.send_time ?? '09:00' }
  }

  const members = (memberProfiles ?? []).map(p => ({ id: p.id, full_name: p.full_name }))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure automated email notifications for admins and members.</p>
      </div>

      <div className="space-y-4">
        <EmailSettingCard
          settingKey="admin_daily_task_summary"
          label="Daily Task Summary"
          description="Sends all admins a morning email with: active tasks due today with owners, tasks missed yesterday, monthly task load by department, and all pending score approvals."
          role="admin"
          initialEnabled={settings['admin_daily_task_summary']?.enabled ?? false}
          initialSendTime={settings['admin_daily_task_summary']?.send_time ?? '07:30'}
        />

        <EmailSettingCard
          settingKey="member_daily_digest"
          label="Member Daily Digest"
          description="Sends each member a personalised daily email covering tasks due today, overdue tasks at risk of losing scores, dependency approvals pending their review, and task or score approvals received yesterday."
          role="member"
          initialEnabled={settings['member_daily_digest']?.enabled ?? false}
          initialSendTime={settings['member_daily_digest']?.send_time ?? '09:00'}
          members={members}
        />
      </div>
    </div>
  )
}
