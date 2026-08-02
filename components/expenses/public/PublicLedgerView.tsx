import Link from 'next/link'
import { publicReportPath } from '@/lib/expense-constants'
import { formatDay, usd, usd2, type PublicLedgerPage } from '@/lib/expense-report'

interface Option { id: string; name: string }

interface Props {
  token: string
  data: PublicLedgerPage
  options: { categories: Option[]; teams: Option[]; verticals: Option[]; vendors: Option[] }
  years: number[]
  /** The filter values currently in effect, echoed back into the form. */
  active: Record<string, string>
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-50 text-green-700 border-green-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

// Filtering and paging are plain links and a GET form: no session, no client
// bundle, and every view is a shareable URL.
export default function PublicLedgerView({ token, data, options, years, active }: Props) {
  const { rows, page, lastPage, total, sumTotal, sumTax } = data
  const path = publicReportPath(token)

  const pageHref = (p: number) => {
    const q = new URLSearchParams({ ...active, view: 'ledger' })
    if (p > 1) q.set('page', String(p))
    else q.delete('page')
    return `${path}?${q.toString()}`
  }

  const hasFilters = Object.entries(active).some(([k, v]) => k !== 'view' && k !== 'page' && v)

  return (
    <>
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <form method="GET" action={path} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="view" value="ledger" />

          <label className="text-xs text-gray-500">
            <span className="block mb-1">Search</span>
            <input
              type="search" name="q" defaultValue={active.q ?? ''}
              placeholder="description, link, notes…"
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-52 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <Select label="Year" name="year" value={active.year} options={years.map(y => ({ id: String(y), name: String(y) }))} />
          <Select label="Category" name="category_id" value={active.category_id} options={options.categories} />
          <Select label="Team" name="team_id" value={active.team_id} options={options.teams} />
          <Select label="Vertical" name="vertical_id" value={active.vertical_id} options={options.verticals} />
          <Select label="Vendor" name="vendor_id" value={active.vendor_id} options={options.vendors} />
          <Select label="Status" name="status" value={active.status}
            options={[{ id: 'paid', name: 'Paid' }, { id: 'pending', name: 'Pending' }, { id: 'cancelled', name: 'Cancelled' }]} />

          <button type="submit"
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg">
            Apply
          </button>
          {hasFilters && (
            <Link href={`${path}?view=ledger`}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900">
              Clear
            </Link>
          )}
        </form>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Ledger
            <span className="ml-2 font-normal text-gray-500">
              {total.toLocaleString('en-US')} {total === 1 ? 'entry' : 'entries'}
              {hasFilters && ' matching'}
            </span>
          </h2>
          <p className="text-xs text-gray-500 tabular-nums">
            Total <span className="font-semibold text-gray-900">{usd2(sumTotal)}</span>
            {sumTax > 0 && <> · of which tax {usd2(sumTax)}</>}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Category', 'Description', 'Link', 'Team', 'Paid to', 'Status', 'Asked', 'Net', 'Tax', 'Total']
                  .map((h, i) => (
                    <th key={h} scope="col"
                      className={`px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap ${i >= 7 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{formatDay(r.expense_date)}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.category ?? '—'}</td>
                  {/* Many link rows carry no description — the note is the only
                      prose there is, so it becomes the label rather than leaving
                      an em dash above real text. Each value appears once. */}
                  <td className="px-3 py-2 text-gray-800 max-w-xs">
                    {(() => {
                      const primary = r.description || r.vendor || r.notes || r.link_domain
                      const extras = [r.vendor, r.notes].filter(
                        (v): v is string => !!v && v !== primary,
                      )
                      return (
                        <>
                          <span className="block truncate" title={primary ?? undefined}>
                            {primary ?? '—'}
                          </span>
                          {extras.map(e => (
                            <span key={e} className="block text-xs text-gray-400 truncate" title={e}>{e}</span>
                          ))}
                        </>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-2 max-w-[16rem]">
                    {r.link_url || r.link_domain ? (
                      <>
                        {r.link_url ? (
                          <a href={r.link_url} target="_blank" rel="noreferrer nofollow"
                            className="text-blue-600 hover:underline block truncate" title={r.link_url}>
                            {r.link_domain ?? r.link_url}
                          </a>
                        ) : (
                          <span className="block truncate text-gray-700">{r.link_domain}</span>
                        )}
                        <span className="text-xs text-gray-400">
                          {r.da !== null && `DA ${r.da}`}
                          {r.da !== null && r.backlink_type && ' · '}
                          {r.backlink_type}
                        </span>
                      </>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {r.team ?? '—'}
                    {r.vertical && <span className="block text-xs text-gray-400">{r.vertical}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-[10rem]">
                    <span className="block truncate" title={r.payee ?? undefined}>{r.payee ?? '—'}</span>
                    {(r.acquired_by || r.country) && (
                      <span className="block text-xs text-gray-400 truncate">
                        {[r.acquired_by, r.country].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STATUS_STYLE[r.payment_status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {r.payment_status}
                    </span>
                    {r.payment_method && (
                      <span className="block text-xs text-gray-400 mt-0.5">{r.payment_method.replace(/_/g, ' ')}</span>
                    )}
                    {r.invoice_url && (
                      <a href={r.invoice_url} target="_blank" rel="noreferrer nofollow"
                        className="block text-xs text-blue-600 hover:underline mt-0.5">invoice</a>
                    )}
                  </td>
                  {/* Asked vs paid: the negotiation is a real part of this report. */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-400">
                    {r.initial_price_usd && r.initial_price_usd > r.total_usd ? usd2(r.initial_price_usd) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-600">{usd2(r.amount_usd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-500">
                    {r.tax_usd ? usd2(r.tax_usd) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-gray-900">{usd2(r.total_usd)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-sm text-gray-500">
                    Nothing matches those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {lastPage}</p>
            <div className="flex gap-1">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>Previous</PageLink>
              <PageLink href={pageHref(page + 1)} disabled={page >= lastPage}>Next</PageLink>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function Select({ label, name, value, options }: {
  label: string; name: string; value?: string; options: Option[]
}) {
  return (
    <label className="text-xs text-gray-500">
      <span className="block mb-1">{label}</span>
      <select name={name} defaultValue={value ?? ''}
        className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 max-w-[11rem]">
        <option value="">All</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

function PageLink({ href, disabled, children }: {
  href: string; disabled: boolean; children: React.ReactNode
}) {
  if (disabled) {
    return <span className="px-3 py-1.5 text-sm text-gray-300 select-none">{children}</span>
  }
  return (
    <Link href={href} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
      {children}
    </Link>
  )
}
