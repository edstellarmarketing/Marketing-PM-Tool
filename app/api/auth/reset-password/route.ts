import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const supabaseUrl = process.env.SERVICE_URL_SUPABASEKONG || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SERVICE_SUPABASESERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify({
      type: 'recovery',
      email: parsed.data.email,
      redirect_to: `${appUrl}/login`,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('generate_link error:', err)
    return NextResponse.json({ error: 'Failed to generate reset link' }, { status: 500 })
  }

  const data = await res.json()

  // Replace any internal Docker/Kong hostname with the public Supabase URL
  const rawUrl: string = data.action_link ?? ''
  const resetUrl = rawUrl.replace(/https?:\/\/[^/]+(:\d+)?(?=\/auth)/, supabaseUrl)

  if (resetUrl) {
    await sendEmail(
      parsed.data.email,
      'Reset your Marketing PM Tool password',
      passwordResetEmailHtml(resetUrl)
    )
  }

  return NextResponse.json({ success: true })
}
