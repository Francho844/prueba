// app/login/helpers.ts
import { supabase } from '@/lib/supabase'

export async function syncServerCookies(access_token?: string|null, refresh_token?: string|null) {
  if (!access_token || !refresh_token) return false
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token }),
    })
    if (!res.ok) {
      // log defensivo
      const t = await res.text().catch(()=> '')
      console.error('syncServerCookies /api/auth failed', res.status, t)
      return false
    }
    return true
  } catch (err) {
    console.error('syncServerCookies fetch error', err)
    return false
  }
}

export async function pickDestination(userId: string, redirectParam: string | null) {
  if (redirectParam) return redirectParam

  // 1) Server-first: usa cookies HTTP-only (más confiable)
  try {
    const resp = await fetch('/api/me/destination', { method: 'GET', cache: 'no-store' })
    if (resp.ok) {
      const json = await resp.json()
      if (json?.dest) return json.dest
    }
  } catch {}

  // 2) Fallback cliente: lee roles desde la BD con el userId
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles:role_id(code)')
      .eq('user_id', userId)

    if (!error && Array.isArray(data)) {
      const codes = data
        .map((r:any)=> String(r?.roles?.code || '').toLowerCase().trim())
      const isAdmin = codes.includes('admin')
      const teacherLike = new Set(['teacher','profesor','docente','teachers'])
      const isTeacher = codes.some(c => teacherLike.has(c))
      const isStudent = codes.includes('student') || codes.includes('estudiante')

      if (isAdmin) return '/admin'
      if (isTeacher) return '/teacher'
      if (isStudent) return '/estudiante'
    }
  } catch {}

  // 3) Default
  return '/dashboard'
}

