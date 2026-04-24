'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { success: true } | { success: false; error: string }

async function assertAdmin(adminUserId: string) {
  const adminClient = createAdminClient()
  const { data: adminProfile, error } = await adminClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', adminUserId)
    .single()

  if (error || !adminProfile || adminProfile.role !== 'admin' || adminProfile.is_active === false) {
    return { adminClient, error: 'Unauthorized' }
  }

  return { adminClient, error: null }
}

export async function updateUserAccountStatus(
  adminUserId: string,
  userId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { adminClient, error } = await assertAdmin(adminUserId)
  if (error) return { success: false, error }

  if (adminUserId === userId) {
    return { success: false, error: 'You cannot deactivate your own account' }
  }

  const { data: existingProfile, error: findError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (findError || !existingProfile) return { success: false, error: 'User not found' }

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? 'none' : '876000h',
  })

  if (authError) return { success: false, error: authError.message }

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId)

  if (profileError) return { success: false, error: profileError.message }

  revalidatePath('/admin')
  revalidatePath(`/admin/users/${userId}`)
  return { success: true }
}

export async function removeUserAccount(adminUserId: string, userId: string): Promise<ActionResult> {
  const { adminClient, error } = await assertAdmin(adminUserId)
  if (error) return { success: false, error }

  if (adminUserId === userId) {
    return { success: false, error: 'You cannot remove your own account' }
  }

  // Delete in trigger-safe order:
  // 1-3: clear child tables while profile still exists (triggers may fire but FK is valid)
  // 4: wipe performance_summaries after triggers have settled
  // 5: delete profile (no remaining FK references)
  // 6: delete auth user
  await adminClient.from('notifications').delete().eq('user_id', userId)
  await adminClient.from('tasks').delete().eq('user_id', userId)
  await adminClient.from('monthly_scores').delete().eq('user_id', userId)

  const { error: psError } = await adminClient.from('performance_summaries').delete().eq('user_id', userId)
  if (psError) return { success: false, error: `Failed to delete performance data: ${psError.message}` }

  const { error: profileError } = await adminClient.from('profiles').delete().eq('id', userId)
  if (profileError) return { success: false, error: `Failed to delete profile: ${profileError.message}` }

  const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
  if (authError) return { success: false, error: `Auth error: ${authError.message}` }

  revalidatePath('/admin')
  return { success: true }
}
