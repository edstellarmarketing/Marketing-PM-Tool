import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import MonthDetailClient from '@/components/admin/MonthDetailClient'

const MIN_YEAR = 2026
const MIN_MONTH = 6

function isMonthAllowed(year: number, month: number) {
  if (Number.isNaN(year) || Number.isNaN(month)) return false
  if (month < 1 || month > 12) return false
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && month < MIN_MONTH) return false
  return true
}

export default async function MonthDetailPage({ params }: { params: Promise<{ year: string; month: string }> }) {
  const { year: yearStr, month: monthStr } = await params
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!isMonthAllowed(year, month)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('role', 'member')
    .eq('is_active', true)
    .order('full_name')

  return <MonthDetailClient year={year} month={month} members={members ?? []} />
}
