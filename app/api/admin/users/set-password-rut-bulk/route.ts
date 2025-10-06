import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { normalizeRut } from '../../../../../lib/rut'

export async function POST() {
  try {
    // Trae todos los usuarios con su rol y rut
    const { data: users } = await supabaseAdmin
      .from('app_users')
      .select('id, rut')

    const { data: ur } = await supabaseAdmin
      .from('user_roles').select('user_id, role_id')

    const { data: roles } = await supabaseAdmin
      .from('roles').select('id, code')

    const byUserRole: Record<string, string> = {}
    (ur || []).forEach(r => {
      const code = roles?.find(x => x.id === r.role_id)?.code
      if (code) byUserRole[r.user_id] = code
    })

    let ok = 0, skipped = 0, errors: string[] = []

    for (const u of users || []) {
      const code = byUserRole[u.id]
      if (!code || code === 'student') { skipped++; continue }
      const pwd = normalizeRut(u.rut)
      if (!pwd) { skipped++; continue }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
        password: pwd,
        user_metadata: { force_password_change: true }
      })
      if (error) {
        errors.push(`${u.id}:${error.message}`)
      } else {
        ok++
      }
    }

    return NextResponse.json({ ok, skipped, errors })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
