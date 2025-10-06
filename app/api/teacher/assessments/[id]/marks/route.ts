// app/api/teacher/assessments/[id]/marks/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function getUserId(): string | null {
  try {
    const tok = cookies().get('sb-access-token')?.value
    if (!tok) return null
    const [_, p] = tok.split('.')
    const b64 = p.replace(/-/g,'+').replace(/_/g,'/')
    const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0
    const payload = JSON.parse(Buffer.from(b64 + '='.repeat(pad), 'base64').toString('utf8'))
    return payload?.sub || null
  } catch { return null }
}

async function getAssessmentAndAuthorize(assessmentId: number, teacherId: string) {
  const { data: ev, error: e1 } = await supabaseAdmin
    .from('assessments')
    .select('id, course_id, subject_id')
    .eq('id', assessmentId)
    .single()
  if (e1) throw new Error(e1.message)
  if (!ev) throw new Error('Evaluación no encontrada')

  const { data: vrows, error: e2 } = await supabaseAdmin
    .from('v_teacher_course_subjects')
    .select('course_id, subject_id')
    .eq('teacher_id', teacherId)
    .eq('course_id', ev.course_id)
    .eq('subject_id', ev.subject_id)
    .limit(1)
  if (e2) throw new Error(e2.message)
  if (!vrows || vrows.length === 0) throw new Error('No estás asignado a este curso/asignatura')

  return ev
}

/**
 * GET: lista roster + marks de la evaluación
 * Respuesta: { ok, items: [{student_id, first_name, last_name, email|null, mark}] }
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = getUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const assessmentId = Number(params.id)
    if (!Number.isFinite(assessmentId)) return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })

    const ev = await getAssessmentAndAuthorize(assessmentId, userId)

    // 1) Roster del curso -> student_ids
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster')
      .select('course_id, student_id')
      .eq('course_id', ev.course_id)
    if (eRoster) return NextResponse.json({ ok: false, error: eRoster.message }, { status: 400 })

    const studentIds = (roster ?? []).map(r => r.student_id)
    if (studentIds.length === 0) return NextResponse.json({ ok: true, items: [] })

    // 2) Datos base desde students (sin email, porque esa columna no existe)
    const { data: students, error: eStudents } = await supabaseAdmin
      .from('students')
      .select('id, first_name, last_name')
      .in('id', studentIds)
    if (eStudents) return NextResponse.json({ ok: false, error: eStudents.message }, { status: 400 })

    // 2b) Intentar completar email desde app_users si existe
    let emailMap = new Map<string, string | null>()
    try {
      const { data: appUsers, error: eApp } = await supabaseAdmin
        .from('app_users')
        .select('id, email')
        .in('id', studentIds)
      if (!eApp && appUsers) {
        emailMap = new Map(appUsers.map((u: any) => [u.id as string, (u.email ?? null) as string | null]))
      }
    } catch {
      // si falla, dejamos emailMap vacío; email quedará en null
    }

    const sMap = new Map((students ?? []).map((s: any) => [s.id as string, s]))

    // 3) Notas existentes para la evaluación
    const { data: marks, error: eMarks } = await supabaseAdmin
      .from('assessment_marks')
      .select('id, student_id, mark')
      .eq('assessment_id', assessmentId)
    if (eMarks) return NextResponse.json({ ok: false, error: eMarks.message }, { status: 400 })

    const mMap = new Map((marks ?? []).map((m: any) => [m.student_id as string, m]))

    const items = (roster ?? []).map((r: any) => {
      const st = sMap.get(r.student_id) || {}
      const mk = mMap.get(r.student_id) || null
      return {
        student_id: r.student_id as string,
        first_name: (st.first_name ?? null) as string | null,
        last_name: (st.last_name ?? null) as string | null,
        email: (emailMap.get(r.student_id) ?? null) as string | null, // puede ser null y la UI ya lo soporta
        mark: (mk?.mark ?? null) as number | null,
      }
    })

    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}

/**
 * POST: guarda notas (upsert) para la evaluación
 * Body: { marks: [{ student_id: uuid, mark: number }] }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = getUserId()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const assessmentId = Number(params.id)
    if (!Number.isFinite(assessmentId)) return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })

    const ev = await getAssessmentAndAuthorize(assessmentId, userId)

    const body = await req.json().catch(() => ({}))
    const arr = Array.isArray(body?.marks) ? body.marks : []
    if (!arr.length) return NextResponse.json({ ok: false, error: 'marks vacío' }, { status: 400 })

    // roster permitido
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster')
      .select('student_id')
      .eq('course_id', ev.course_id)
    if (eRoster) return NextResponse.json({ ok: false, error: eRoster.message }, { status: 400 })
    const allowed = new Set((roster ?? []).map((x: any) => x.student_id as string))

    const rows: { assessment_id: number; student_id: string; mark: number }[] = []
    for (const it of arr) {
      const sid = String(it.student_id || '').trim()
      const mk = Number(it.mark)
      if (!sid || !allowed.has(sid)) {
        return NextResponse.json({ ok: false, error: `Alumno no pertenece al curso (${sid})` }, { status: 400 })
      }
      if (!Number.isFinite(mk) || mk < 1.0 || mk > 7.0) {
        return NextResponse.json({ ok: false, error: `Nota fuera de rango (1.0–7.0) para ${sid}` }, { status: 400 })
      }
      rows.push({ assessment_id: assessmentId, student_id: sid, mark: mk })
    }

    const { error: eUp } = await supabaseAdmin
      .from('assessment_marks')
      .upsert(rows as any, { onConflict: 'assessment_id,student_id' })

    if (eUp) return NextResponse.json({ ok: false, error: eUp.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
