import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleGrantor } from '@/lib/api'
import { sendEmailChecked } from '@/lib/email'
import { expenseWeeklyDigestEmailHtml } from '@/lib/expense-email'
import { getPublicReportUrl, getUpcomingCommitment, getWeeklyDigest, lastWeekRange } from '@/lib/expense-report'

// On/off switch for the weekly digest, plus a test send. Owner-only.
// The flag lives in the shared `email_settings` table alongside the other
// digests rather than in a parallel mechanism of its own.
export const dynamic = 'force-dynamic'

const KEY = 'expenses_weekly_spend'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * True only for a date that actually exists. A regex match is not enough and
 * neither is Date.parse — it accepts "2025-02-30" and rolls it to 02 March, so
 * the bad value reaches Postgres and comes back as a 500. Round-tripping the
 * formatted date is what catches it.
 */
function isRealDate(s: string) {
  if (!DATE_RE.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  if (Number.isNaN(t)) return false
  return new Date(t).toISOString().slice(0, 10) === s
}

/**
 * Resolve which week to report on. Defaults to the week just gone; an explicit
 * start/end lets you preview or send any past week, which is how you check the
 * template against a week that actually had link buys or pending invoices.
 */
function resolveRange(start?: string | null, end?: string | null):
  | { start: string; end: string; historical: boolean }
  | { error: string } {
  if (!start && !end) return { ...lastWeekRange(), historical: false }
  if (!start || !end) return { error: 'Provide both start and end, or neither.' }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { error: 'Dates must be YYYY-MM-DD.' }
  if (!isRealDate(start) || !isRealDate(end)) return { error: 'That is not a real date.' }
  if (end < start) return { error: 'The end date falls before the start date.' }
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1
  // The template is built around a week; a wider span silently changes what the
  // week-on-week comparison means, so cap it rather than mislead.
  if (days > 31) return { error: 'Pick a range of 31 days or less.' }
  const dflt = lastWeekRange()
  return { start, end, historical: start !== dflt.start || end !== dflt.end }
}

export async function GET(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor('expenses')
  if (error || !profile) return error!

  // ?preview=1 renders the email in the browser with this week's real data.
  // Worth having beyond testing: it lets you see exactly what recipients will
  // get before switching the send on, and it works even when the mail transport
  // is not configured.
  const params = new URL(req.url).searchParams
  if (params.get('preview') === '1') {
    const range = resolveRange(params.get('start'), params.get('end'))
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

    const [digest, upcoming, reportUrl] = await Promise.all([
      getWeeklyDigest(range.start, range.end),
      getUpcomingCommitment(30),
      getPublicReportUrl(),
    ])
    const html = expenseWeeklyDigestEmailHtml({
      recipientName: profile.full_name?.split(' ')[0] ?? 'there',
      ...digest,
      historical: range.historical,
      upcoming: upcoming.renewals,
      upcomingTotal: upcoming.total,
      reportUrl,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    })
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const db = createAdminClient()
  const { data } = await db.from('email_settings').select('enabled, updated_at').eq('key', KEY).maybeSingle()
  const reportUrl = await getPublicReportUrl()
  return NextResponse.json({ enabled: data?.enabled ?? false, updated_at: data?.updated_at ?? null, reportUrl })
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const db = createAdminClient()

  if (typeof body?.enabled === 'boolean') {
    const { error: e } = await db
      .from('email_settings')
      .upsert({ key: KEY, enabled: body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (e) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ enabled: body.enabled })
  }

  // Test send goes to the caller only, never the recipient list — checking the
  // template should not put a half-finished email in the CEO's inbox.
  if (body?.action === 'test') {
    const { data: authUser } = await db.auth.admin.getUserById(profile.id)
    const to = authUser?.user?.email
    if (!to) return NextResponse.json({ error: 'Your account has no email address' }, { status: 400 })

    const range = resolveRange(body?.start, body?.end)
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })
    const { start, end } = range

    const [digest, upcoming, reportUrl] = await Promise.all([
      getWeeklyDigest(start, end),
      getUpcomingCommitment(30),
      getPublicReportUrl(),
    ])

    const result = await sendEmailChecked(
      to,
      `[Test] Weekly spend — ${start} to ${end}`,
      expenseWeeklyDigestEmailHtml({
        recipientName: profile.full_name?.split(' ')[0] ?? 'there',
        ...digest,
        historical: range.historical,
        upcoming: upcoming.renewals,
        upcomingTotal: upcoming.total,
        reportUrl,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
      }),
    )

    // Report the real outcome. A test send that says "sent" while the transport
    // is unconfigured is worse than no test at all — you would switch the weekly
    // digest on believing it works.
    if (!result.ok) {
      return NextResponse.json({
        error: result.reason === 'unconfigured'
          ? 'Email is not configured on this server (GOOGLE_APPS_SCRIPT_EMAIL_URL). Nothing was sent.'
          : `The mail service refused the message: ${result.detail}`,
      }, { status: 502 })
    }
    return NextResponse.json({ ok: true, sentTo: to, range: { start, end } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
