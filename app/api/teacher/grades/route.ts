// app/api/teacher/grades/route.ts
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
  } catch { return null }
}

function toTermLabel(n: any): 'S1' | 'S2' | null {
  const x = Number(n)
  if (x === 1) return 'S1'
  if (x === 2) return 'S2'
  return null
}

function guessTermFromDate(dateStr: string | null): 'S1' | 'S2' | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const m = d.getUTCMonth() + 1
  return m <= 6 ? 'S1' : 'S2'
}

/**
 * GET /api/teacher/grades?course_id=&subject_id=
 * Respuesta:
 * {
 *   ok: true,
 *   students: [{ id, first_name, last_name, list_number }],
 *   assessments: [{ id, name, date, weight, term }],
 *   marks: [{ assessment_id, student_id, mark }]
 * }
 *
 * Permisos:
 * - Profesor de la asignatura, o
 * - Profesor Jefe del curso (puede ver cualquier asignatura del curso)
 */
export async function GET(req: Request) {
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const url = new URL(req.url)
    const course_id = Number(url.searchParams.get('course_id') || '')
    const subject_id = Number(url.searchParams.get('subject_id') || '')
    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id)) {
      return NextResponse.json({ ok: false, error: 'course_id y subject_id son obligatorios' }, { status: 400 })
    }

    // Validación: profe de la asignatura O profesor jefe del curso
    const [{ data: asign, error: eAsig }, { data: jefe, error: eJ }] = await Promise.all([
      supabaseAdmin
        .from('v_teacher_course_subjects')
        .select('course_id, subject_id')
        .eq('teacher_id', userId)
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .limit(1),
      supabaseAdmin
        .from('v_homeroom_courses')
        .select('course_id')
        .eq('teacher_id', userId)
        .eq('course_id', course_id)
        .limit(1),
    ])
    if (eAsig) return NextResponse.json({ ok: false, error: eAsig.message }, { status: 400 })
    if (eJ)    return NextResponse.json({ ok: false, error: eJ.message }, { status: 400 })

    const isTeacher   = (asign && asign.length > 0)
    const isHomeroom  = (jefe  && jefe.length  > 0)

    if (!isTeacher && !isHomeroom) {
      // No autorizado a ver: devolvemos vacío para UI consistente
      return NextResponse.json({ ok: true, students: [], assessments: [], marks: [] })
    }

    // Roster (con número de lista)
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster_final')
      .select('student_id, list_number')
      .eq('course_id', course_id)
    if (eRoster) return NextResponse.json({ ok: false, error: eRoster.message }, { status: 400 })

    const studentIds = (roster ?? []).map(r => r.student_id)
    let students: any[] = []
    if (studentIds.length) {
      const { data: srows, error: eS } = await supabaseAdmin
        .from('students')
        .select('id, first_name, last_name')
        .in('id', studentIds)
      if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 400 })

      const numById = new Map<string, number | null>()
      for (const r of roster ?? []) numById.set(r.student_id, r.list_number ?? null)

      students = (srows ?? []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name ?? null,
        last_name:  s.last_name  ?? null,
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
    }

    // Evaluaciones
    const { data: arows, error: eA } = await supabaseAdmin
      .from('assessments')
      .select('id, name, date, weight, semester_id, school_semesters(number)')
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .order('date', { ascending: true, nullsFirst: true })
      .order('id',   { ascending: true })
    if (eA) return NextResponse.json({ ok: false, error: eA.message }, { status: 400 })

    const assessments = (arows ?? []).map((a: any) => {
      const term = toTermLabel(a.school_semesters?.number ?? null) ?? guessTermFromDate(a.date ?? null)
      return { id: a.id, name: a.name, date: a.date, weight: a.weight, term }
    })

    // Notas
    let marks: any[] = []
    if (assessments.length) {
      const ids = assessments.map(a => a.id)
      const { data: mrows, error: eM } = await supabaseAdmin
        .from('assessment_marks')
        .select('assessment_id, student_id, mark')
        .in('assessment_id', ids)
      if (eM) return NextResponse.json({ ok: false, error: eM.message }, { status: 400 })
      marks = mrows ?? []
    }

    return NextResponse.json({ ok: true, students, assessments, marks })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}

/**
 * POST /api/teacher/grades
 * Body: { course_id, subject_id, marks: [{ assessment_id, student_id, mark }] }
 *
 * Ahora permite EDITAR si:
 * - es Profesor de la asignatura, **o**
 * - es Profesor Jefe del curso (puede editar todas las asignaturas del curso)
 */
export async function POST(req: Request) {
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const course_id = Number(body?.course_id)
    const subject_id = Number(body?.subject_id)
    const arr = Array.isArray(body?.marks) ? body.marks : []

    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id)) {
      return NextResponse.json({ ok: false, error: 'course_id y subject_id son obligatorios' }, { status: 400 })
    }
    if (!arr.length) {
      return NextResponse.json({ ok: false, error: 'marks vacío' }, { status: 400 })
    }

    // Permitir edición si es profe de la asignatura O profesor jefe del curso
    const [{ data: asign, error: eAsig }, { data: jefe, error: eJ }] = await Promise.all([
      supabaseAdmin
        .from('v_teacher_course_subjects')
        .select('course_id, subject_id')
        .eq('teacher_id', userId)
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .limit(1),
      supabaseAdmin
        .from('v_homeroom_courses')
        .select('course_id')
        .eq('teacher_id', userId)
        .eq('course_id', course_id)
        .limit(1),
    ])
    if (eAsig) return NextResponse.json({ ok: false, error: eAsig.message }, { status: 400 })
    if (eJ)    return NextResponse.json({ ok: false, error: eJ.message }, { status: 400 })

    const isTeacher  = (asign && asign.length > 0)
    const isHomeroom = (jefe  && jefe.length  > 0)

    if (!isTeacher && !isHomeroom) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso para editar notas en este curso/asignatura' }, { status: 403 })
    }

    // Evaluaciones válidas del curso/asignatura
    const { data: aval, error: eAval } = await supabaseAdmin
      .from('assessments')
      .select('id')
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
    if (eAval) return NextResponse.json({ ok: false, error: eAval.message }, { status: 400 })
    const allowedAssessments = new Set((aval ?? []).map(a => a.id))

    // Alumnos válidos del curso
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster_final')
      .select('student_id')
      .eq('course_id', course_id)
    if (eRoster) return NextResponse.json({ ok: false, error: eRoster.message }, { status: 400 })
    const allowedStudents = new Set((roster ?? []).map(r => r.student_id))

    // Validar payload
    const rows: { assessment_id: number; student_id: string; mark: number }[] = []
    for (const it of arr) {
      const aid = Number(it.assessment_id)
      const sid = String(it.student_id || '').trim()
      const mk  = Number(it.mark)

      if (!allowedAssessments.has(aid)) {
        return NextResponse.json({ ok: false, error: `Evaluación inválida: ${aid}` }, { status: 400 })
      }
      if (!allowedStudents.has(sid)) {
        return NextResponse.json({ ok: false, error: `Alumno fuera del curso: ${sid}` }, { status: 400 })
      }
      if (!Number.isFinite(mk) || mk < 1.0 || mk > 7.0) {
        return NextResponse.json({ ok: false, error: 'Nota fuera de rango (1.0–7.0)' }, { status: 400 })
      }
      rows.push({ assessment_id: aid, student_id: sid, mark: mk })
    }

    // Upsert por (assessment_id, student_id)
    const { error: eUp } = await supabaseAdmin
      .from('assessment_marks')
      .upsert(rows as any, { onConflict: 'assessment_id,student_id' })
    if (eUp) return NextResponse.json({ ok: false, error: eUp.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
