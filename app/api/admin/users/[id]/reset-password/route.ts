import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id

    // Leer email
    const { data: u, error: uErr } = await supabaseAdmin
      .from('app_users')
      .select('email')
      .eq('id', userId)
      .single()
    if (uErr || !u?.email) {
      return NextResponse.json({ error: 'Usuario no encontrado o sin email' }, { status: 404 })
    }

    // Generar link de recuperación (password reset)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: u.email,
      options: { redirectTo: 'http://localhost:3000/auth/callback' },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // data.properties.action_link es el enlace directo
    const url =
      // @ts-ignore
      data?.properties?.action_link || data?.action_link || null

    if (!url) return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 })
    return NextResponse.json({ ok: true, url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
