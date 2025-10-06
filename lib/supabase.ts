// lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de navegador (ANON).
 * Persistimos sesión para que el SDK pueda refrescar tokens.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true } }
)

/**
 * Admin SOLO en servidor, creado lazy (no en el import).
 * - En cliente: NO se crea ni se lee ninguna env.
 * - En servidor: se construye la primera vez que se usa.
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
  _admin = createClient(URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}

/**
 * Compatibilidad retro: exponemos `supabaseAdmin.from(...)`
 * como si fuera un cliente. Internamente delega a getSupabaseAdmin()
 * en el primer acceso (solo en server).
 */
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_t, prop) {
      // @ts-ignore - delega cualquier método/propiedad al cliente real
      const val = (getSupabaseAdmin() as any)[prop]
      return typeof val === 'function' ? val.bind(getSupabaseAdmin()) : val
    },
  }
) as unknown as SupabaseClient
