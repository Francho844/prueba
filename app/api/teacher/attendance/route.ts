// app/api/teacher/attendance/route.ts
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
 * GET /api/teacher/attendance?course_id=8&subject_id=9&date=2025-10-01
 *
 * Respuesta:
 * {
 *   ok: true,
 *   session: { id, course_id, subject_id, date },
 *   students: [{ id, first_name, last_name, list_number }],
 *   marks: [{ student_id, status }],  // status: 'P'|'A'|'J' (presente, ausente, justificado) - ajustable
 * }
 *
 * Si no existe la sesión para ese día, la crea (idempotente por (course_id,subject_id,date)).
 */
export async function GET(req: Request) {
  try {
    const uid = getUserId()
    if (!uid) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const url = new URL(req.url)
    const course_id = Number(url.searchParams.get('course_id') || '')
    const subject_id = Number(url.searchParams.get('subject_id') || '')
    const date = (url.searchParams.get('date') || '').trim() // ISO yyyy-mm-dd

    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'course_id, subject_id y date (YYYY-MM-DD) son obligatorios' }, { status: 400 })
    }

    // Validar que el profe esté asignado a ese curso/asignatura
    const { data: asign, error: eAsig } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', uid)
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .limit(1)
    if (eAsig) return NextResponse.json({ ok: false, error: eAsig.message }, { status: 400 })
    if (!asign || asign.length === 0) {
      return NextResponse.json({ ok: false, error: 'No estás asignado a este curso/asignatura' }, { status: 403 })
    }

    // 1) Asegurar/obtener sesión (idempotente por (course_id, subject_id, date))
    //    Si tienes unique index en la tabla, mejor.
    let sessionId: number | null = null
    {
      const { data: existing, error: eSel } = await supabaseAdmin
        .from('attendance_sessions')
        .select('id')
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .eq('date', date)
        .limit(1)
        .maybeSingle()
      if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 400 })

      if (existing?.id) {
        sessionId = existing.id
      } else {
        const { data: ins, error: eIns } = await supabaseAdmin
          .from('attendance_sessions')
          .insert([{ course_id, subject_id, date }])
          .select('id')
          .single()
        if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 400 })
        sessionId = ins.id
      }
    }

    // 2) Roster con número de lista (fuente única enrollments)
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster_final') // course_id, student_id, list_number
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
    }

    // 3) Marcas guardadas
    const { data: marks, error: eM } = await supabaseAdmin
      .from('attendance_marks')
      .select('student_id, status')
      .eq('session_id', sessionId!)
    if (eM) return NextResponse.json({ ok: false, error: eM.message }, { status: 400 })

    // 4) Armar respuesta
    return NextResponse.json({
      ok: true,
      session: { id: sessionId, course_id, subject_id, date },
      students,
      marks: marks ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}

/**
 * POST /api/teacher/attendance
 * Body: {
 *   course_id, subject_id, date, // (YYYY-MM-DD)
 *   marks: [{ student_id, status }] // status: 'P'|'A'|'J' (ajústalo a tu catálogo)
 * }
 *
 * Crea/asegura la sesión y hace upsert de attendance_marks por (session_id, student_id).
 */
export async function POST(req: Request) {
  try {
    const uid = getUserId()
    if (!uid) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const course_id = Number(body?.course_id)
    const subject_id = Number(body?.subject_id)
    const date = (body?.date || '').trim()
    const arr = Array.isArray(body?.marks) ? body.marks : []

    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'course_id, subject_id y date (YYYY-MM-DD) son obligatorios' }, { status: 400 })
    }
    if (!arr.length) {
      return NextResponse.json({ ok: false, error: 'marks vacío' }, { status: 400 })
    }

    // Validar asignación
    const { data: asign, error: eAsig } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', uid)
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .limit(1)
    if (eAsig) return NextResponse.json({ ok: false, error: eAsig.message }, { status: 400 })
    if (!asign || asign.length === 0) {
      return NextResponse.json({ ok: false, error: 'No estás asignado a este curso/asignatura' }, { status: 403 })
    }

    // Asegurar sesión
    let sessionId: number | null = null
    {
      const { data: existing, error: eSel } = await supabaseAdmin
        .from('attendance_sessions')
        .select('id')
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .eq('date', date)
        .limit(1)
        .maybeSingle()
      if (eSel) return NextResponse.json({ ok: false, error: eSel.message }, { status: 400 })

      if (existing?.id) {
        sessionId = existing.id
      } else {
        const { data: ins, error: eIns } = await supabaseAdmin
          .from('attendance_sessions')
          .insert([{ course_id, subject_id, date }])
          .select('id')
          .single()
        if (eIns) return NextResponse.json({ ok: false, error: eIns.message }, { status: 400 })
        sessionId = ins.id
      }
    }

    // Validar alumnos válidos (del curso)
    const { data: roster, error: eRoster } = await supabaseAdmin
      .from('v_course_roster_final')
      .select('student_id')
      .eq('course_id', course_id)
    if (eRoster) return NextResponse.json({ ok: false, error: eRoster.message }, { status: 400 })
    const allowed = new Set((roster ?? []).map(r => r.student_id))

    // Preparar filas
    const rows: { session_id: number; student_id: string; status: string }[] = []
    for (const it of arr) {
      const sid = String(it.student_id || '').trim()
      const status = String(it.status || '').trim().toUpperCase() // P|A|J (ajustable)
      if (!allowed.has(sid)) {
        return NextResponse.json({ ok: false, error: `Alumno fuera del curso: ${sid}` }, { status: 400 })
      }
      if (!['P', 'A', 'J'].includes(status)) {
        return NextResponse.json({ ok: false, error: `Estado inválido: ${status}` }, { status: 400 })
      }
      rows.push({ session_id: sessionId!, student_id: sid, status })
    }

    // Upsert por (session_id, student_id)
    const { error: eUp } = await supabaseAdmin
      .from('attendance_marks')
      .upsert(rows as any, { onConflict: 'session_id,student_id' })
    if (eUp) return NextResponse.json({ ok: false, error: eUp.message }, { status: 400 })

    return NextResponse.json({ ok: true, session_id: sessionId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
