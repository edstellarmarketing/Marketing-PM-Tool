import { notFound } from 'next/navigation'
import {
  getPublicFilterOptions, getPublicLedger, getPublicOverview, getPublicSubscriptions,
  resolvePublicToken,
} from '@/lib/expense-report'
import {
  PublicFooter, PublicHeader, PublicNav, type PublicView,
} from '@/components/expenses/public/PublicChrome'
import PublicOverviewView from '@/components/expenses/public/PublicOverviewView'
import PublicLedgerView from '@/components/expenses/public/PublicLedgerView'
import PublicSubscriptionsView from '@/components/expenses/public/PublicSubscriptionsView'

// Tokenised public spend report. No session and no app chrome — the token in the
// URL is the only credential, so:
//
//   - Read-only, always. There is no POST/PATCH/DELETE path from this page and
//     none of these components import a mutation.
//   - Settings is NOT reachable here: no module access, no public link controls,
//     no email recipients, no lookup editing. Everything else a viewer sees is.
//   - The recycle bin is excluded: getPublicLedger never honours `deleted`.
//   - No credentials. The importer drops the source workbooks' password columns,
//     so none exist in this data. Never add a field that carries them.
//   - A revoked or unknown token is a plain 404, identical to a typo, so the page
//     never confirms that a given token once existed.
//   - noindex, because a link pasted anywhere public would otherwise be crawled.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Spend report',
  robots: { index: false, follow: false, nocache: true },
}

// Only these reach the filter helper. Anything else in the query string is
// ignored rather than passed through to the database.
const FILTER_KEYS = [
  'q', 'year', 'month', 'from', 'to',
  'category_id', 'team_id', 'vertical_id', 'vendor_id', 'backlink_type_id', 'status',
] as const

type Search = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function PublicExpenseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Search>
}) {
  const { token } = await params
  if (!(await resolvePublicToken(token))) notFound()

  const sp = await searchParams
  const viewParam = first(sp.view)
  const view: PublicView =
    viewParam === 'ledger' ? 'ledger' : viewParam === 'subscriptions' ? 'subscriptions' : 'overview'

  const overview = await getPublicOverview()
  if (!overview) notFound()

  const generated = new Date(overview.generatedAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className={`mx-auto space-y-6 ${view === 'ledger' ? 'max-w-[90rem]' : 'max-w-5xl'}`}>
        <PublicHeader generated={generated} />
        <PublicNav token={token} view={view} />

        {view === 'overview' && <PublicOverviewView data={overview} />}

        {view === 'ledger' && await (async () => {
          const active: Record<string, string> = {}
          const query = new URLSearchParams()
          for (const k of FILTER_KEYS) {
            const v = first(sp[k]).trim()
            if (v) { active[k] = v; query.set(k, v) }
          }
          const page = Math.max(1, parseInt(first(sp.page), 10) || 1)

          const [data, options] = await Promise.all([
            getPublicLedger(query, { page, pageSize: 50 }),
            getPublicFilterOptions(),
          ])
          return (
            <PublicLedgerView
              token={token}
              data={data}
              options={options}
              years={overview.years}
              active={active}
            />
          )
        })()}

        {view === 'subscriptions' && <PublicSubscriptionsView rows={await getPublicSubscriptions()} />}

        <PublicFooter />
      </div>
    </div>
  )
}
