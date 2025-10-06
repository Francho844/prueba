// app/api/teacher/jefatura/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getUserIdFromCookie(): string | null {
  try {
    const tok = cookies().get('sb-access-token')?.value
    if (!tok) return null
    const [, p] = tok.split('.')
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0
    const payload = JSON.parse(Buffer.from(b64 + '='.repeat(pad), 'base64').toString('utf8'))
    return payload?.sub || null
  } catch {
    return null
  }
}

/**
 * GET /api/teacher/jefatura
 *
 * Devuelve el curso del que el usuario es Profesor Jefe (vigente), con:
 * - course: { id, code, name, school_year_id }
 * - students: [{ student_id, list_number, students: { first_name, last_name, run } }]
 * - subjects: [{ id (course_subjects.id), subject_id, subjects: { name, code } }]
 *
 * Estructura:
 * { ok:true, homeroom: { course, students, subjects } }  // si es PJ
 * { ok:true, homeroom:null }                              // si NO es PJ vigente
 */
export async function GET() {
  try {
    const uid = getUserIdFromCookie()
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })
    }

    // 1) ¿Es PJ de algún curso vigente? (usamos vista v_homeroom_courses)
    const { data: vh, error: eVH } = await supabaseAdmin
      .from('v_homeroom_courses')
      .select('course_id')
      .eq('teacher_id', uid)
      .limit(1)

    if (eVH) {
      return NextResponse.json({ ok: false, error: eVH.message }, { status: 400 })
    }
    if (!vh || vh.length === 0) {
      // No es profesor jefe vigente
      return NextResponse.json({ ok: true, homeroom: null })
    }

    const course_id = vh[0].course_id

    // 2) Datos del curso
    const { data: course, error: eC } = await supabaseAdmin
      .from('courses')
      .select('id, code, name, school_year_id')
      .eq('id', course_id)
      .single()
    if (eC) {
      return NextResponse.json({ ok: false, error: eC.message }, { status: 400 })
    }

    // 3) Roster con número de lista (v_course_roster_final debe exponer list_number)
    const { data: roster, error: eR } = await supabaseAdmin
      .from('v_course_roster_final') // columnas esperadas: course_id, student_id, list_number
      .select('student_id, list_number, students(first_name,last_name,run)')
      .eq('course_id', course_id)
    if (eR) {
      return NextResponse.json({ ok: false, error: eR.message }, { status: 400 })
    }

    // 4) Asignaturas del curso
    const { data: subjects, error: eS } = await supabaseAdmin
      .from('course_subjects')
      .select('id, subject_id, subjects(name, code)')
      .eq('course_id', course_id)
      .order('id', { ascending: true })
    if (eS) {
      return NextResponse.json({ ok: false, error: eS.message }, { status: 400 })
    }

    // 5) Respuesta
    return NextResponse.json({
      ok: true,
      homeroom: {
        course,
        students: roster ?? [],
        subjects: subjects ?? [],
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
