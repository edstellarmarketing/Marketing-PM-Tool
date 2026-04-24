import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, inviteEmailHtml } from '@/lib/email'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['admin', 'member']).default('member'),
  department: z.string().optional(),
  designation: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabaseUrl = process.env.SERVICE_URL_SUPABASEKONG || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SERVICE_SUPABASESERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const adminClient = createAdminClient()

  // Step 1: Create the auth user with email pre-confirmed and no password.
  // email_confirm: true skips the email verification step so we fully control
  // the onboarding via the set-password link we generate below.
  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
      role: parsed.data.role,
    },
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })

  const userId = userData.user.id

  // Step 2: Pre-create the profile row so the user appears in admin lists immediately
  await adminClient.from('profiles').upsert({
    id: userId,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    department: parsed.data.department ?? null,
    designation: parsed.data.designation ?? null,
  }, { onConflict: 'id' })

  // Step 3: Generate a recovery (set-password) link — same mechanism as forgot password,
  // which is proven to work. User lands on /login with type=recovery in the hash.
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
    // User was created — still return success so admin knows the account exists,
    // but warn that the email couldn't be sent
    return NextResponse.json({ error: 'User created but failed to send invite email. Ask the user to use "Forgot password" to set their password.' }, { status: 500 })
  }

  const linkData = await res.json()
  const rawUrl: string = linkData.action_link ?? ''
  // Replace any internal Docker/Kong hostname with the public Supabase URL
  const setPasswordUrl = rawUrl.replace(/https?:\/\/[^/]+(:\d+)?(?=\/auth)/, supabaseUrl)

  if (!setPasswordUrl) {
    return NextResponse.json({ error: 'Failed to generate set-password link' }, { status: 500 })
  }

  await sendEmail(
    parsed.data.email,
    "You're invited to Marketing PM Tool",
    inviteEmailHtml(parsed.data.full_name, setPasswordUrl)
  )

  return NextResponse.json({ success: true })
}
