import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'avatars'
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File must be under 2 MB' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Only JPG, PNG and WebP are allowed' }, { status: 400 })

  const admin = createAdminClient()

  // Create bucket if it doesn't exist yet
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.find(b => b.id === BUCKET)) {
    const { error: bucketError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
      allowedMimeTypes: ALLOWED_TYPES,
    })
    if (bucketError) return NextResponse.json({ error: 'Could not initialise storage: ' + bucketError.message }, { status: 500 })
  }

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(user.id, bytes, { upsert: true, contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(user.id)
  // Bust CDN cache on every re-upload
  const avatar_url = publicUrl + '?v=' + Date.now()

  return NextResponse.json({ avatar_url })
}
