import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin'
import { normalizeRut } from '../../../../../../lib/rut'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id
    // Leer rut y rol
    const { data: u, error: uErr } = await supabaseAdmin
      .from('app_users')
      .select('rut, email')
      .eq('id', userId)
      .single()
    if (uErr || !u) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const { data: ur } = await supabaseAdmin
      .from('user_roles')
      .select('role_id').eq('user_id', userId)
    const { data: roles } = await supabaseAdmin
      .from('roles').select('id, code')
    const code = roles?.find(r => r.id === ur?.[0]?.role_id)?.code || null
    if (code === 'student') {
      return NextResponse.json({ error: 'Este endpoint no aplica a alumnos' }, { status: 400 })
    }

    const rutPwd = normalizeRut(u.rut)
    if (!rutPwd || rutPwd.length < 3) {
      return NextResponse.json({ error: 'RUT inválido o ausente' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: rutPwd,
      user_metadata: { force_password_change: true } // opcional: exigir cambio
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
