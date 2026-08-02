import { escapeHtml } from '@/lib/email'

// Weekly spend digest. Replaces the message the team posts by hand each week —
// tools grouped by team, the links acquired with their DA, anything still
// unpaid — and adds the year-to-date context that message never carried.
//
// Table layout with inline styles throughout: Gmail and Outlook strip <style>
// blocks and ignore flex/grid, so anything cleverer degrades badly.

export interface WeeklyDigestEmailArgs {
  recipientName: string
  start: string
  end: string
  /** True when the range is not the week just gone, so the copy stops saying
   *  "last week" and the renewal blocks are labelled as today's, not the week's. */
  historical?: boolean
  weekTotal: number
  priorWeekTotal: number
  entryCount: number
  tools: { team: string; items: { name: string; cycle: string | null; amount: number }[]; subtotal: number }[]
  toolsTotal: number
  links: { url: string | null; domain: string | null; da: number | null; type: string | null; amount: number }[]
  linksTotal: number
  otherCategories: { name: string; total: number }[]
  pending: { description: string; domain: string | null; url: string | null; invoice: string | null; amount: number }[]
  pendingTotal: number
  savedThisWeek: number
  askedThisWeek: number
  largest: { name: string; amount: number } | null
  // Everything renewing in the next 30 days, plus what that commits us to.
  upcoming: { name: string; ends_on: string | null; amount_usd: number | null; daysUntil: number; urgency: 'overdue' | 'urgent' | 'soon' }[]
  upcomingTotal: number
  year: number
  yearToDate: number
  yearByCategory: { name: string; total: number }[]
  reportUrl: string | null
  appUrl: string
}

// Links are the point of the report for the SEO side, so list them generously —
// a busy week runs to the mid-20s. Past this, Gmail starts clipping the message
// ("View entire message"), which hides the year-to-date block underneath.
const LINK_LIMIT = 40

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money0 = (n: number) =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

function day(d: string) {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// Only linkify http(s). A stored value could be anything, and `javascript:` in an
// href is a live hazard in the handful of clients that honour it.
function safeUrl(u: string | null): string | null {
  if (!u) return null
  return /^https?:\/\//i.test(u.trim()) ? u.trim() : null
}

function section(title: string, body: string) {
  return `
    <tr><td style="padding:24px 28px 0">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${title}</p>
      ${body}
    </td></tr>`
}

function row(left: string, right: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="font-size:13px;color:#374151;padding:3px 0">${left}</td>
        <td align="right" style="font-size:13px;color:#111827;font-weight:600;white-space:nowrap;padding:3px 0">${right}</td>
      </tr>
    </table>`
}

export function expenseWeeklyDigestEmailHtml(a: WeeklyDigestEmailArgs) {
  const delta = a.weekTotal - a.priorWeekTotal
  const deltaPct = a.priorWeekTotal > 0 ? Math.round((delta / a.priorWeekTotal) * 100) : null
  const ytd = a.yearByCategory.slice(0, 5)
  // Only overdue and ≤7 days get the red treatment. Colouring the whole 30-day
  // list red would make the genuinely urgent rows indistinguishable.
  const urgent = a.upcoming.filter(r => r.urgency !== 'soon')
  const savingsRate = a.askedThisWeek > 0 ? Math.round((a.savedThisWeek / a.askedThisWeek) * 100) : null

  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">

      <tr><td style="padding:28px 28px 0">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563eb">Weekly spend report</p>
        <h1 style="margin:6px 0 0;font-size:20px;color:#111827">${day(a.start)} &ndash; ${day(a.end)}${a.historical ? ` ${escapeHtml(a.end.slice(0, 4))}` : ''}</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280">Hi ${escapeHtml(a.recipientName)}, here is what Edstellar spent ${a.historical ? 'in that week' : 'last week'}.</p>
      </td></tr>

      <tr><td style="padding:20px 28px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px">
              <p style="margin:0;font-size:12px;color:#6b7280">Spent this week</p>
              <p style="margin:2px 0 0;font-size:26px;font-weight:700;color:#111827">${money(a.weekTotal)}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280">${
                deltaPct === null
                  ? `${a.entryCount} ${a.entryCount === 1 ? 'entry' : 'entries'}`
                  : `${delta >= 0 ? '&#9650;' : '&#9660;'} ${Math.abs(deltaPct)}% vs the week before`
              }</p>
            </td>
            <td width="12"></td>
            <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px">
              <p style="margin:0;font-size:12px;color:#6b7280">${a.year} to date</p>
              <p style="margin:2px 0 0;font-size:26px;font-weight:700;color:#111827">${money0(a.yearToDate)}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280">across ${a.yearByCategory.length} ${a.yearByCategory.length === 1 ? 'category' : 'categories'}</p>
            </td>
          </tr>
        </table>
      </td></tr>

      ${urgent.length === 0 ? '' : `
      <tr><td style="padding:18px 28px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px">
          <tr><td style="padding:14px 16px">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991b1b">
              &#9888; ${urgent.length} subscription${urgent.length === 1 ? '' : 's'} need${urgent.length === 1 ? 's' : ''} attention now
            </p>
            ${urgent.slice(0, 8).map(r => `
              <p style="margin:0 0 2px;font-size:13px;color:#7f1d1d">
                <strong>${escapeHtml(r.name)}</strong> &mdash; ${
                  r.daysUntil < 0
                    ? `${Math.abs(r.daysUntil)} day${Math.abs(r.daysUntil) === 1 ? '' : 's'} overdue`
                    : r.daysUntil === 0 ? 'renews today' : `renews in ${r.daysUntil} day${r.daysUntil === 1 ? '' : 's'}`
                }${r.amount_usd !== null ? ` &middot; ${money(r.amount_usd)}` : ''}
              </p>`).join('')}
          </td></tr>
        </table>
      </td></tr>`}

      ${a.upcoming.length === 0 ? '' : section(`Coming up &middot; next 30 days${a.historical ? ' from today' : ''} &middot; ${money(a.upcomingTotal)} committed`, `
        ${a.upcoming.slice(0, 10).map(r => row(
          `${escapeHtml(r.name)} <span style="color:${r.urgency === 'soon' ? '#9ca3af' : '#b91c1c'}">${
            r.daysUntil < 0 ? `(${Math.abs(r.daysUntil)}d overdue)`
            : r.daysUntil === 0 ? '(today)' : `(in ${r.daysUntil}d)`
          }</span>`,
          r.amount_usd !== null ? money(r.amount_usd) : '&mdash;',
        )).join('')}
        ${a.upcoming.length > 10 ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">&hellip;and ${a.upcoming.length - 10} more</p>` : ''}
      `)}

      ${(a.savedThisWeek <= 0 && !a.largest && a.pendingTotal <= 0) ? '' : `
      <tr><td style="padding:18px 28px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:10px">
          <tr><td style="padding:12px 16px">
            ${a.savedThisWeek > 0 ? `<p style="margin:0 0 4px;font-size:13px;color:#374151">Negotiated down <strong style="color:#111827">${money(a.savedThisWeek)}</strong>${savingsRate !== null ? ` &mdash; ${savingsRate}% off the asking price` : ''}</p>` : ''}
            ${a.largest ? `<p style="margin:0 0 4px;font-size:13px;color:#374151">Largest single item: <strong style="color:#111827">${escapeHtml(a.largest.name)}</strong> at ${money(a.largest.amount)}</p>` : ''}
            ${a.pendingTotal > 0 ? `<p style="margin:0;font-size:13px;color:#374151">Awaiting payment: <strong style="color:#92400e">${money(a.pendingTotal)}</strong> across ${a.pending.length} ${a.pending.length === 1 ? 'entry' : 'entries'}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>`}

      ${a.tools.length === 0 ? '' : section(`Tools &amp; subscriptions &middot; ${money(a.toolsTotal)}`,
        a.tools.map(t => `
          <p style="margin:12px 0 4px;font-size:13px;font-weight:600;color:#111827">${escapeHtml(t.team)}</p>
          ${t.items.map(i => row(
            `${escapeHtml(i.name)}${i.cycle ? ` <span style="color:#9ca3af">(${escapeHtml(i.cycle)})</span>` : ''}`,
            money(i.amount),
          )).join('')}`).join(''))}

      ${a.links.length === 0 ? '' : section(`Links acquired &middot; ${a.links.length} &middot; ${money(a.linksTotal)}`, `
        ${a.links.slice(0, LINK_LIMIT).map(l => {
          const href = safeUrl(l.url)
          const label = escapeHtml(l.domain ?? l.url ?? 'link')
          return row(
            `${href ? `<a href="${escapeHtml(href)}" style="color:#2563eb;text-decoration:none">${label}</a>` : label}`
            + `${l.da !== null ? ` <span style="color:#9ca3af">(DA ${l.da})</span>` : ''}`
            + `${l.type ? ` <span style="color:#9ca3af">&middot; ${escapeHtml(l.type)}</span>` : ''}`,
            money(l.amount),
          )
        }).join('')}
        ${a.links.length > LINK_LIMIT ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">&hellip;and ${a.links.length - LINK_LIMIT} more &mdash; see the full list in the ledger</p>` : ''}
      `)}

      ${a.otherCategories.length === 0 ? '' : section('Other spend',
        a.otherCategories.map(c => row(escapeHtml(c.name), money(c.total))).join(''))}

      ${a.pending.length === 0 ? '' : section(`Payment pending &middot; ${a.pending.length}`,
        a.pending.map(p => {
          const href = safeUrl(p.url)
          const inv = safeUrl(p.invoice)
          return `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:8px">
            <tr><td style="padding:10px 12px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:13px;color:#111827;font-weight:600">${escapeHtml(p.description)}</td>
                  <td align="right" style="font-size:13px;color:#92400e;font-weight:700;white-space:nowrap">${money(p.amount)}</td>
                </tr>
              </table>
              ${href ? `<p style="margin:4px 0 0;font-size:12px"><a href="${escapeHtml(href)}" style="color:#2563eb;text-decoration:none">${escapeHtml(p.domain ?? href)}</a></p>` : ''}
              ${inv ? `<p style="margin:2px 0 0;font-size:12px"><a href="${escapeHtml(inv)}" style="color:#2563eb;text-decoration:none">Invoice</a></p>` : ''}
            </td></tr>
          </table>`
        }).join(''))}

      ${ytd.length === 0 ? '' : section(`${a.year} so far`,
        // Two cells per bar, not one: a lone <td> stretches to fill its table
        // whatever width it declares, so every bar rendered full-width.
        ytd.map(c => {
          const pct = a.yearToDate > 0 ? Math.round((c.total / a.yearToDate) * 100) : 0
          return `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:6px">
            <tr>
              <td style="font-size:13px;color:#374151;padding-bottom:3px">${escapeHtml(c.name)}</td>
              <td align="right" style="font-size:13px;color:#111827;font-weight:600;white-space:nowrap">${money0(c.total)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></td>
            </tr>
            <tr><td colspan="2">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#e5e7eb;border-radius:3px">
                <tr>
                  <td width="${Math.max(pct, 1)}%" style="height:6px;background:#2a78d6;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
                  <td width="${100 - Math.max(pct, 1)}%" style="height:6px;font-size:0;line-height:0">&nbsp;</td>
                </tr>
              </table>
            </td></tr>
          </table>`
        }).join(''))}

      <tr><td style="padding:26px 28px 28px">
        ${a.reportUrl
          ? `<a href="${escapeHtml(a.reportUrl)}" style="display:inline-block;padding:11px 20px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">View the full report &rarr;</a>
             <p style="margin:10px 0 0;font-size:11px;color:#9ca3af">This link opens without signing in &mdash; please don't forward it outside the company.</p>`
          : `<a href="${escapeHtml(a.appUrl)}/expenses" style="display:inline-block;padding:11px 20px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">Open Expenses &rarr;</a>`}
        <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
          Sent weekly from the Marketing PM Tool. Ask Vijay to stop these or change who receives them.
        </p>
      </td></tr>

    </table>
  </div>`
}
