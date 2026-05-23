import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import MonthDetailClient from '@/components/admin/MonthDetailClient'

const MIN_YEAR = 2026
const MIN_MONTH = 5

function isMonthAllowed(year: number, month: number) {
  if (Number.isNaN(year) || Number.isNaN(month)) return false
  if (month < 1 || month > 12) return false
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && month < MIN_MONTH) return false
  return true
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month1: number): number {
  // JS: month is 0-indexed; day 0 of next month = last day of given month
  return new Date(year, month1, 0).getDate()
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

  const adminClient = createAdminClient()
  const startOfMonth = `${year}-${pad2(month)}-01`
  const endOfMonth = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`

  const [{ data: members }, { data: monthTasks }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, full_name, avatar_url, department')
      .eq('role', 'member')
      .eq('is_active', true)
      .order('full_name'),
    adminClient
      .from('tasks')
      .select('user_id, status')
      .neq('is_draft', true)
      .is('parent_task_id', null)
      .gte('due_date', startOfMonth)
      .lte('due_date', endOfMonth),
  ])

  const memberIds = new Set((members ?? []).map(m => m.id))

  const totalByUser: Record<string, number> = {}
  const doneByUser: Record<string, number> = {}
  for (const t of monthTasks ?? []) {
    if (!memberIds.has(t.user_id)) continue
    totalByUser[t.user_id] = (totalByUser[t.user_id] ?? 0) + 1
    if (t.status === 'done') doneByUser[t.user_id] = (doneByUser[t.user_id] ?? 0) + 1
  }

  const users = (members ?? [])
    .filter(m => (totalByUser[m.id] ?? 0) > 0)
    .map(m => ({
      id: m.id,
      full_name: m.full_name,
      avatar_url: m.avatar_url,
      department: m.department ?? null,
      total: totalByUser[m.id] ?? 0,
      done: doneByUser[m.id] ?? 0,
    }))

  return <MonthDetailClient year={year} month={month} users={users} />
}
