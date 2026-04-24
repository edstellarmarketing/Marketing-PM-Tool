import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, appraisalPublishedEmailHtml } from '@/lib/email'
import { z } from 'zod'

const schema = z.object({
  financial_year: z.string().regex(/^\d{4}-\d{2}$/),
  published: z.boolean(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = createAdminClient()

  const { data, error: dbError } = await admin
    .from('appraisal_snapshots')
    .update({
      published: parsed.data.published,
      published_at: parsed.data.published ? new Date().toISOString() : null,
    })
    .eq('user_id', userId)
    .eq('financial_year', parsed.data.financial_year)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Notify the member if publishing
  if (parsed.data.published) {
    await admin.from('notifications').insert({
      user_id: userId,
      title: 'Appraisal Published',
      body: `Your FY ${parsed.data.financial_year} appraisal has been published. You can now view it.`,
    })

    // Send email notification via Google Apps Script
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    if (authUser.user?.email) {
      const fullName = authUser.user.user_metadata?.full_name ?? 'Team Member'
      await sendEmail(
        authUser.user.email,
        `Your FY ${parsed.data.financial_year} appraisal is ready`,
        appraisalPublishedEmailHtml(fullName, process.env.NEXT_PUBLIC_APP_URL ?? '')
      )
    }
  }

  return NextResponse.json(data)
}
