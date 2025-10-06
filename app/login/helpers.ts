// app/login/helpers.ts
import { supabase } from '@/lib/supabase'

export async function syncServerCookies(access_token?: string | null, refresh_token?: string | null) {
  try {
    const body = (access_token && refresh_token) ? { access_token, refresh_token } : {}
    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',           // explícito (aunque sea same-origin)
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function pickDestination(userId: string, redirectParam: string | null) {
  if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) return redirectParam
  const qs = new URLSearchParams()
  if (userId) qs.set('userId', userId)
  const resp = await fetch(`/api/me/destination?${qs.toString()}`, { cache: 'no-store' })
  const json = await resp.json().catch(() => ({}))
  return (json?.dest as string) || '/estudiante'
}
