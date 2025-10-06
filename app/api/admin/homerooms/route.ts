import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/homerooms
 * Devuelve todas las jefaturas, con curso y profesor incluidos.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('homerooms')
      .select(`
        course_id,
        teacher_id,
        since,
        until,
        course:courses (id, code, name),
        teacher:app_users (id, first_name, last_name, email)
      `)
      .order('course_id', { ascending: true })
      .order('since', { ascending: true })

    if (error) throw error
    return NextResponse.json({ ok: true, items: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/homerooms
 * Body: { course_id, teacher_id, since? }
 * Asigna un nuevo profesor jefe al curso (cierra el anterior).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const course_id = Number(body.course_id)
    const teacher_id = String(body.teacher_id || '').trim()
    const since = body.since || new Date().toISOString().slice(0, 10)

    if (!course_id || !teacher_id) {
      return NextResponse.json({ ok: false, error: 'course_id y teacher_id son obligatorios' }, { status: 400 })
    }

    // Cerrar jefatura vigente
    await supabaseAdmin
      .from('homerooms')
      .update({ until: since })
      .eq('course_id', course_id)
      .is('until', null)

    // Insertar nuevo
    const { error } = await supabaseAdmin
      .from('homerooms')
      .insert({ course_id, teacher_id, since, until: null })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

/**
 * PUT /api/admin/homerooms
 * Body: { course_id }
 * Cierra la jefatura vigente del curso.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const course_id = Number(body.course_id)
    if (!course_id) {
      return NextResponse.json({ ok: false, error: 'course_id obligatorio' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabaseAdmin
      .from('homerooms')
      .update({ until: today })
      .eq('course_id', course_id)
      .is('until', null)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
