import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'Marketing-PM-Tool' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — middleware handles session refresh
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()
  const url = process.env.SERVICE_URL_SUPABASEKONG || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SERVICE_SUPABASESERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createServerClient(
    url,
    key,
    {
      db: { schema: 'Marketing-PM-Tool' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
