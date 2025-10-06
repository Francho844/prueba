import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

export default async function DebugRoles() {
  const c = await cookies()
  const at = c.get('sb-access-token')?.value || null
  const payload = at ? decodeJwt(at) : null
  const userId = payload?.sub || payload?.user_id || null

  let roles: string[] = []
  let error: string | null = null

  if (userId) {
    // 1) Intenta leer role_code directo en user_roles
    const ur = await supabaseAdmin
      .from('user_roles')
      .select('role_code, role_id')
      .eq('user_id', userId)

    if (ur.error) {
      error = ur.error.message
    }

    const urRows = ur.data ?? []
    const roleCodes = urRows
      .map((r: any) => r?.role_code)
      .filter(Boolean)
      .map((s: string) => s.toLowerCase().trim())

    if (roleCodes.length) {
      roles = roleCodes
    } else {
      // 2) Si no hay role_code, resuelve role_id -> roles.code
      const roleIds = urRows.map((r: any) => r?.role_id).filter(Boolean)
      if (roleIds.length) {
        const rr = await supabaseAdmin
          .from('roles')
          .select('id, code')
          .in('id', roleIds)

        if (rr.error) {
          error = rr.error.message
        } else {
          roles = (rr.data ?? [])
            .map((r: any) => String(r?.code || '').toLowerCase().trim())
            .filter(Boolean)
        }
      }
    }
  }

  return (
    <pre style={{ padding: 16, background: '#fafafa', border: '1px solid #eee', borderRadius: 12, overflowX: 'auto' }}>
      {JSON.stringify({ userId, roles, error, jwt_payload: payload }, null, 2)}
    </pre>
  )
}
