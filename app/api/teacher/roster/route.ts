// app/api/teacher/roster/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getUserId(): string | null {
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
 * GET /api/teacher/roster?course_id=8
 * Devuelve { ok:true, students:[{id,first_name,last_name,list_number}] }
 * Permite: profesor de CUALQUIER asignatura del curso O profesor jefe del curso.
 */
export async function GET(req: Request) {
  try {
    const uid = getUserId()
    if (!uid) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const url = new URL(req.url)
    const course_id = Number(url.searchParams.get('course_id') || '')
    if (!Number.isFinite(course_id)) {
      return NextResponse.json({ ok: false, error: 'course_id es obligatorio' }, { status: 400 })
    }

    // Permitir si es profe de alguna asignatura del curso o PJ del curso
    const [{ data: asig, error: eA }, { data: jefe, error: eJ }] = await Promise.all([
      supabaseAdmin
        .from('v_teacher_course_subjects')
        .select('course_id')
        .eq('teacher_id', uid)
        .eq('course_id', course_id)
        .limit(1),
      supabaseAdmin
        .from('v_homeroom_courses')
        .select('course_id')
        .eq('teacher_id', uid)
        .eq('course_id', course_id)
        .limit(1),
    ])
    if (eA) return NextResponse.json({ ok: false, error: eA.message }, { status: 400 })
    if (eJ) return NextResponse.json({ ok: false, error: eJ.message }, { status: 400 })
    if ((!asig || asig.length === 0) && (!jefe || jefe.length === 0)) {
      return NextResponse.json({ ok: false, error: 'No estás asignado a este curso' }, { status: 403 })
    }

    const { data: roster, error: eR } = await supabaseAdmin
      .from('v_course_roster_final') // course_id, student_id, list_number
      .select('student_id, list_number')
      .eq('course_id', course_id)
    if (eR) return NextResponse.json({ ok: false, error: eR.message }, { status: 400 })

    const ids = (roster ?? []).map(r => r.student_id)
    const { data: srows, error: eS } = await supabaseAdmin
      .from('students')
      .select('id, first_name, last_name')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 400 })

    const numById = new Map<string, number | null>()
    for (const r of roster ?? []) numById.set(r.student_id, r.list_number ?? null)

    const students = (srows ?? []).map((s: any) => ({
      id: s.id,
      first_name: s.first_name ?? null,
      last_name: s.last_name ?? null,
      list_number: numById.get(s.id) ?? null,
    })).sort((a: any, b: any) => {
      const an = a.list_number, bn = b.list_number
      if (an != null && bn != null && an !== bn) return an - bn
      if (an != null && bn == null) return -1
      if (an == null && bn != null) return 1
      const aname = `${a.last_name ?? ''} ${a.first_name ?? ''}`
      const bname = `${b.last_name ?? ''} ${b.first_name ?? ''}`
      return aname.localeCompare(bname, 'es')
    })

    return NextResponse.json({ ok: true, students })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}

/**
 * PUT /api/teacher/roster
 * Body: { course_id, numbers: [{ student_id, list_number|null }] }
 * EDITA list_number. Requiere: Profesor Jefe del curso (o admin si lo manejas aparte).
 */
export async function PUT(req: Request) {
  try {
    const uid = getUserId()
    if (!uid) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const course_id = Number(body?.course_id)
    const numbers = Array.isArray(body?.numbers) ? body.numbers : []
    if (!Number.isFinite(course_id) || numbers.length === 0) {
      return NextResponse.json({ ok: false, error: 'course_id y numbers son obligatorios' }, { status: 400 })
    }

    // SOLO Profesor Jefe del curso
    const { data: jefe, error: eJ } = await supabaseAdmin
      .from('v_homeroom_courses')
      .select('course_id')
      .eq('teacher_id', uid)
      .eq('course_id', course_id)
      .limit(1)
    if (eJ) return NextResponse.json({ ok: false, error: eJ.message }, { status: 400 })
    if (!jefe || jefe.length === 0) {
      return NextResponse.json({ ok: false, error: 'Solo el Profesor Jefe puede editar el número de lista' }, { status: 403 })
    }

    // Alumnos realmente en el curso
    const { data: roster, error: eR } = await supabaseAdmin
      .from('v_course_roster_final')
      .select('student_id')
      .eq('course_id', course_id)
    if (eR) return NextResponse.json({ ok: false, error: eR.message }, { status: 400 })

    const allowed = new Set((roster ?? []).map(r => r.student_id))

    // Validación + update por fila
    for (const it of numbers) {
      const sid = String(it.student_id || '').trim()
      const lnRaw = it.list_number
      const ln = lnRaw === null || lnRaw === '' ? null : Number(lnRaw)

      if (!allowed.has(sid)) {
        return NextResponse.json({ ok: false, error: `Alumno fuera del curso: ${sid}` }, { status: 400 })
      }
      if (ln !== null && (!Number.isFinite(ln) || ln < 1 || ln > 999)) {
        return NextResponse.json({ ok: false, error: 'list_number debe ser 1..999 o null' }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from('enrollments')
        .update({ list_number: ln })
        .eq('course_id', course_id)
        .eq('student_id', sid)

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
