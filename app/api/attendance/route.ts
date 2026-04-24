import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const createLeaveSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leave_type:  z.enum(['sick', 'casual']),
  is_half_day: z.boolean().optional().default(false),
  note:        z.string().max(200).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year  = searchParams.get('year')

  const supabase = await createClient()
  let query = supabase
    .from('attendance_leaves')
    .select('*')
    .eq('user_id', user!.id)
    .order('date', { ascending: true })

  if (month && year) {
    const mNum = parseInt(month)
    const yNum = parseInt(year)
    const nextM = mNum === 12 ? 1 : mNum + 1
    const nextY = mNum === 12 ? yNum + 1 : yNum
    const mStr = mNum.toString().padStart(2, '0')
    query = query
      .gte('date', `${yNum}-${mStr}-01`)
      .lt('date', `${nextY}-${nextM.toString().padStart(2, '0')}-01`)
  }

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = createLeaveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('attendance_leaves')
    .insert({ ...parsed.data, user_id: user!.id })
    .select()
    .single()

  if (dbError) {
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'A leave already exists for this date' }, { status: 409 })
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
