import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import MonthUserClient from '@/components/admin/MonthUserClient'

const MIN_YEAR = 2026
const MIN_MONTH = 6

function isMonthAllowed(year: number, month: number) {
  if (Number.isNaN(year) || Number.isNaN(month)) return false
  if (month < 1 || month > 12) return false
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && month < MIN_MONTH) return false
  return true
}

export default async function MonthUserPage({ params }: { params: Promise<{ year: string; month: string; userId: string }> }) {
  const { year: yearStr, month: monthStr, userId } = await params
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!isMonthAllowed(year, month)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: target } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', userId)
    .single()

  if (!target) notFound()

  return <MonthUserClient year={year} month={month} user={target} />
}
