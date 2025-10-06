import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from './supabaseAdmin'

function decodeJwt(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = payload.length % 4 ? 4 - (payload.length % 4) : 0
    const base = payload + '='.repeat(pad)
    const json = Buffer.from(base, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch { return null }
}

export async function getUserIdFromCookies(): Promise<string | null> {
  const c = await cookies()
  const at = c.get('sb-access-token')?.value
  if (!at) return null
  const payload = decodeJwt(at)
  const sub = payload?.sub || payload?.user_id || null
  return sub ?? null
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('roles:role_id(code)')
    .eq('user_id', userId)
  if (error) return false
  const roles = (data ?? []).map((r: any) => r?.roles?.code).filter(Boolean)
  return roles.includes('admin')
}

export async function requireAdmin(opts?: { redirectTo?: string }) {
  const userId = await getUserIdFromCookies()
  if (!userId) redirect('/login')
  const ok = await isAdminUser(userId!)
  if (!ok) redirect(opts?.redirectTo ?? '/dashboard')
  return userId!
}

export async function isTeacherUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('roles:role_id(code)')
    .eq('user_id', userId)
  if (error) return false
  const codes = (data ?? []).map((r: any) => String(r?.roles?.code || '').toLowerCase().trim())
  const teacherLike = new Set(['teacher','profesor','docente','teachers'])
  return codes.some(c => teacherLike.has(c)) || codes.includes('admin')
}

export async function requireTeacher(opts?: { redirectTo?: string }) {
  const userId = await getUserIdFromCookies()
  if (!userId) redirect('/login')
  const ok = await isTeacherUser(userId!)
  if (!ok) redirect(opts?.redirectTo ?? '/dashboard')
  return userId!
}
