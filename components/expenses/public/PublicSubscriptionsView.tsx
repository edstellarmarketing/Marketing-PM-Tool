import { RENEWAL_URGENT_DAYS } from '@/lib/expense-constants'
import { formatDay, usd2, type PublicSubscriptionRow } from '@/lib/expense-report'
import { Card } from './PublicChrome'

// Read-only mirror of the in-app subscriptions table, using the same urgency
// threshold so a renewal that shows red in the app shows red here too.
export default function PublicSubscriptionsView({ rows }: { rows: PublicSubscriptionRow[] }) {
  const active = rows.filter(r => r.is_active)
  const dueSoon = active.filter(r => r.daysUntil !== null && r.daysUntil <= RENEWAL_URGENT_DAYS)
  const committed = dueSoon.reduce((a, r) => a + (r.amount_usd ?? 0), 0)
  // amount_usd is the price PER CYCLE, so cycles must be normalised before they
  // are added up — summing raw amounts across mixed cycles is the exact mistake
  // the source spreadsheet invites. one_time/credits/custom carry no recurring
  // commitment, so they are excluded rather than counted as monthly.
  const RECURRING = new Set(['monthly', 'yearly'])
  const monthly = active.reduce((a, r) => {
    const amt = r.amount_usd ?? 0
    const c = (r.billing_cycle ?? '').toLowerCase()
    if (!RECURRING.has(c)) return a
    return a + (c === 'yearly' ? amt / 12 : amt)
  }, 0)

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Active subscriptions" value={String(active.length)} />
        <Card label={`Renewing in ${RENEWAL_URGENT_DAYS} days`} value={String(dueSoon.length)} hint={usd2(committed)} />
        <Card label="Run rate / month" value={usd2(monthly)} hint="yearly spread over 12 months" />
        <Card label="Cancelled or expired" value={String(rows.length - active.length)} />
      </div>

      {dueSoon.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            {dueSoon.length === 1
              ? '1 subscription needs attention'
              : `${dueSoon.length} subscriptions need attention`}
            <span className="font-normal"> · {usd2(committed)} committed</span>
          </p>
          <ul className="mt-1 space-y-0.5">
            {dueSoon.map(r => (
              <li key={r.id} className="text-sm text-red-700">
                <span className="font-medium">{r.name}</span>
                {' — '}
                {r.daysUntil !== null && r.daysUntil < 0
                  ? `${Math.abs(r.daysUntil)} days overdue`
                  : r.daysUntil === 0 ? 'renews today' : `renews in ${r.daysUntil} days`}
                {r.amount_usd !== null && ` · ${usd2(r.amount_usd)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">
          Subscriptions
          <span className="ml-2 font-normal text-gray-500">{rows.length} total</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Name', 'Team', 'Owner', 'Cycle', 'Started', 'Renews', 'Amount']
                  .map((h, i) => (
                    <th key={h} scope="col"
                      className={`px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap ${i === 6 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const urgent = r.is_active && r.daysUntil !== null && r.daysUntil <= RENEWAL_URGENT_DAYS
                return (
                  <tr key={r.id} className={urgent ? 'bg-red-50/50' : 'hover:bg-gray-50/60'}>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${r.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                        {r.name}
                      </span>
                      {r.vendor && r.vendor !== r.name && (
                        <span className="block text-xs text-gray-400">{r.vendor}</span>
                      )}
                      {r.notes && <span className="block text-xs text-gray-400 truncate max-w-xs" title={r.notes}>{r.notes}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.team ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.owner ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {(r.billing_cycle ?? '—').replace(/_/g, ' ')}
                      {r.seats && <span className="block text-xs text-gray-400">{r.seats} seats</span>}
                      {!r.is_active && <span className="block text-xs text-gray-400">{r.status}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">
                      {r.started_on ? formatDay(r.started_on) : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {r.ends_on ? (
                        <>
                          <span className={urgent ? 'font-semibold text-red-700' : 'text-gray-700'}>
                            {formatDay(r.ends_on)}
                          </span>
                          {r.is_active && r.daysUntil !== null && (
                            <span className={`block text-xs ${urgent ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                              {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue`
                                : r.daysUntil === 0 ? 'today' : `in ${r.daysUntil}d`}
                            </span>
                          )}
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-gray-900">
                        {r.amount_usd === null ? '—' : usd2(r.amount_usd)}
                      </span>
                      {r.payment_method && (
                        <span className="block text-xs text-gray-400 font-normal">{r.payment_method.replace(/_/g, ' ')}</span>
                      )}
                      {r.invoice_url && (
                        <a href={r.invoice_url} target="_blank" rel="noreferrer nofollow"
                          className="block text-xs text-blue-600 hover:underline font-normal">invoice</a>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-500">No subscriptions recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
