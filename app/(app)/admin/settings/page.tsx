import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PointConfigEditor from '@/components/admin/PointConfigEditor'
import AwardsSettings from '@/components/admin/AwardsSettings'
import type { PointConfig, AwardType } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function AdminSettingsPage({ searchParams }: Props) {
  const { tab = 'points' } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: configs }, { data: awardTypes }] = await Promise.all([
    supabase.from('point_config').select('*').order('category').order('config_key'),
    admin.from('award_types').select('*').order('created_at'),
  ])

  const tabs = [
    { key: 'points', label: 'Point Config' },
    { key: 'awards', label: 'Awards' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure scoring weights and award types.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/admin/settings?tab=${t.key}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'points' && (
        <PointConfigEditor initialConfigs={(configs ?? []) as PointConfig[]} />
      )}

      {tab === 'awards' && (
        <AwardsSettings initialAwards={(awardTypes ?? []) as AwardType[]} />
      )}
    </div>
  )
}
