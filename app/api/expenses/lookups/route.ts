import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/api'

// Every lookup the ledger's filter bar and (from Phase 3) the entry form need,
// in one round-trip. Inactive rows are returned too: a retired vendor must
// still render on the historical expenses that point at it. Callers filter on
// `is_active` when populating a "create new" picker.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const db = createAdminClient()

  const [categories, teams, verticals, vendors, backlinkTypes] = await Promise.all([
    db.from('expense_categories').select('id, name, slug, sort_order, is_active, created_at').order('sort_order'),
    db.from('expense_teams').select('id, name, is_active, created_at').order('name'),
    db.from('expense_verticals').select('id, name, is_active, created_at').order('name'),
    db.from('expense_vendors').select('id, name, is_active, created_at').order('name'),
    db.from('expense_backlink_types').select('id, name, is_active, created_at').order('name'),
  ])

  const failed = [categories, teams, verticals, vendors, backlinkTypes].find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({
    categories: categories.data ?? [],
    teams: teams.data ?? [],
    verticals: verticals.data ?? [],
    vendors: vendors.data ?? [],
    backlinkTypes: backlinkTypes.data ?? [],
  })
}
