import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, getAuthUser } from '@/lib/api'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1),
})

export async function GET() {
  const { error: authError } = await getAuthUser()
  if (authError) return authError

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { error: adminError } = await requireAdmin()
  if (adminError) return adminError

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: parsed.data.name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  revalidatePath('/admin')
  revalidatePath('/plans')
  
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error: adminError } = await requireAdmin()
  if (adminError) return adminError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/admin')
  revalidatePath('/plans')

  return new NextResponse(null, { status: 204 })
}
