import { createClient } from '@supabase/supabase-js'

// Service-role client — server-side only, never import in client components
export function createAdminClient() {
  const url = process.env.SERVICE_URL_SUPABASEKONG || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SERVICE_SUPABASESERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { db: { schema: 'Marketing-PM-Tool' } })
}
