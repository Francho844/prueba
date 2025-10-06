// lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de navegador (ANON).
 * Persistimos sesión para refresh automático del SDK.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true } }
)

/**
 * Admin SOLO en servidor, creado lazy (no en el import).
 * Así no revienta en componentes 'use client'.
 */
let _admin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin es solo de servidor')
  }
  if (_admin) return _admin
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  if (!URL || !SRK) {
    throw new Error('Faltan env: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE')
  }
  _admin = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

/**
 * Export named: supabaseAdmin (cliente objeto).
 * Internamente delega al cliente real en el primer acceso (solo server).
 */
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_t, prop) {
      // @ts-ignore
      const val = (getSupabaseAdmin() as any)[prop]
      return typeof val === 'function' ? val.bind(getSupabaseAdmin()) : val
    },
  }
) as unknown as SupabaseClient
