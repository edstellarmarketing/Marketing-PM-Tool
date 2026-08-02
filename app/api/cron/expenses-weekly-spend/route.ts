import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailChecked } from '@/lib/email'
import { expenseWeeklyDigestEmailHtml } from '@/lib/expense-email'
import { getPublicReportUrl, getUpcomingCommitment, getWeeklyDigest, lastWeekRange } from '@/lib/expense-report'

// Weekly spend digest. Registered in vercel.json for Monday 02:00 UTC
// (07:30 IST), so it lands before the working day with last week complete.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { data: setting } = await db
    .from('email_settings')
    .select('enabled')
    .eq('key', 'expenses_weekly_spend')
    .maybeSingle()
  if (!setting?.enabled) {
    return NextResponse.json({ skipped: true, reason: 'expenses_weekly_spend disabled' })
  }

  const { data: recipientRows } = await db.from('expense_report_recipients').select('user_id')
  const ids = (recipientRows ?? []).map(r => r.user_id)
  if (ids.length === 0) return NextResponse.json({ skipped: true, reason: 'no recipients' })

  // Re-checked at send time, not just when the recipient was added: someone may
  // have had their access revoked since. Losing module access must stop the
  // emails too, or revocation is only half done.
  const { data: grants } = await db
    .from('module_access')
    .select('user_id')
    .eq('module_key', 'expenses')
    .in('user_id', ids)
  const allowed = new Set((grants ?? []).map(g => g.user_id))
  const revoked = ids.filter(id => !allowed.has(id))

  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, is_active')
    .in('id', [...allowed])

  const { start, end } = lastWeekRange()
  const [digest, upcoming, reportUrl] = await Promise.all([
    getWeeklyDigest(start, end),
    getUpcomingCommitment(30),
    getPublicReportUrl(),
  ])

  const subject = `Weekly spend — ${start} to ${end}`
  let sent = 0
  const failed: string[] = []

  for (const p of (profiles ?? []) as { id: string; full_name: string; is_active: boolean }[]) {
    if (!p.is_active) continue
    const { data: authUser } = await db.auth.admin.getUserById(p.id)
    const to = authUser?.user?.email
    if (!to) { failed.push(p.full_name); continue }

    try {
      const result = await sendEmailChecked(to, subject, expenseWeeklyDigestEmailHtml({
        recipientName: p.full_name?.split(' ')[0] ?? 'there',
        ...digest,
        upcoming: upcoming.renewals,
        upcomingTotal: upcoming.total,
        reportUrl,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
      }))
      if (result.ok) sent++
      else {
        console.error('weekly spend email refused for', p.full_name, result.detail)
        failed.push(p.full_name)
      }
    } catch (e) {
      // One bad address must not stop the rest of the run.
      console.error('weekly spend email failed for', p.full_name, e)
      failed.push(p.full_name)
    }
  }

  return NextResponse.json({
    ok: true,
    range: { start, end },
    weekTotal: digest.weekTotal,
    sent,
    failed,
    skippedNoAccess: revoked.length,
  })
}
