import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id

    // Leer email y metadata (nombres, teléfono, rut)
    const { data: u, error: uErr } = await supabaseAdmin
      .from('app_users')
      .select('email, first_name, last_name, phone, rut')
      .eq('id', userId)
      .single()
    if (uErr || !u?.email) {
      return NextResponse.json({ error: 'Usuario no encontrado o sin email' }, { status: 404 })
    }

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(u.email, {
      data: {
        first_name: u.first_name ?? '',
        last_name: u.last_name ?? '',
        phone: u.phone ?? '',
        rut: u.rut ?? '',
      },
      redirectTo: 'http://localhost:3000/auth/callback',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
