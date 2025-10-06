// lib/authGuard.ts
// ⚠️ Server-only: NO importes este archivo en componentes con 'use client'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_LIKE = new Set(['admin', 'administrator', 'administrador', 'superadmin', 'super_admin', 'root'])

/**
 * Devuelve true si el usuario tiene rol admin.
 * Hace lookup en dos pasos: user_roles -> roles (code/name).
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false

  // 1) Traer role_ids del usuario
  const { data: urRows, error: urErr } = await supabaseAdmin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (urErr || !urRows?.length) return false
  const roleIds = urRows.map((r: any) => r?.role_id).filter(Boolean)
  if (!roleIds.length) return false

  // 2) Traer códigos desde roles (tu tabla tiene code/name)
  const { data: roleRows, error: rErr } = await supabaseAdmin
    .from('roles')
    .select('code, name')
    .in('id', roleIds)

  if (rErr || !roleRows?.length) return false

  const codes = roleRows
    .map((r: any) => String(r?.code ?? r?.name ?? '').toLowerCase().trim())
    .filter(Boolean)

  return codes.some(c => ADMIN_LIKE.has(c))
}

/**
 * Protege layouts/páginas server. Si no hay sesión o no es admin, redirige.
 * Uso: await requireAdmin() en un Server Component (por ej. app/admin/layout.tsx).
 */
export async function requireAdmin(): Promise<void> {
  const jar = cookies()
  const token = jar.get('sb-access-token')?.value

  // Sin token => a login
  if (!token) {
    redirect('/login')
  }

  // Resolver userId desde el token (server-side, con service role)
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  const userId = data?.user?.id
  if (error || !userId) {
    redirect('/login')
  }

  // Check de rol admin
  const ok = await isAdminUser(userId)
  if (!ok) {
    redirect('/estudiante') // o '/' si prefieres
  }

  // Si es admin, simplemente retorna (deja pasar)
}
