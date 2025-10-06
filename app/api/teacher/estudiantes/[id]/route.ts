// app/api/teacher/estudiantes/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic' // evita cache y 304 raros en dev

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const studentId = params?.id
    if (!studentId) {
      return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 })
    }

    // ===== Validar ENV de Supabase (si faltan, NO explotes con HTML)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRole) {
      return NextResponse.json(
        { ok: false, error: 'Faltan variables de entorno de Supabase (URL o SERVICE_ROLE).' },
        { status: 500 }
      )
    }

    // ===== Autorizar por jefatura usando tus cookies
    const cookieHeader = req.headers.get('cookie') ?? ''
    const origin = new URL(req.url).origin
    const homRes = await fetch(`${origin}/api/teacher/homeroom`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    })

    // Si homeroom no retorna JSON, trátalo como no autorizado
    const homCT = homRes.headers.get('content-type') || ''
    let hom: any = null
    if (homCT.includes('application/json')) {
      hom = await homRes.json().catch(() => null)
    } else {
      // probablemente un redirect a login (HTML)
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
    }

    if (!hom?.ok) {
      const status = homRes.status && homRes.status !== 200 ? homRes.status : 403
      return NextResponse.json({ ok: false, error: hom?.error || 'No autorizado' }, { status })
    }
    const allowed = hom?.homeroom?.students?.some((s: any) => s.student_id === studentId)
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'No autorizado para ver este alumno' }, { status: 403 })
    }

    // ===== Supabase admin (Service Role) dentro del handler (evita errores de import)
    const supabaseAdmin = createClient(url, serviceRole, { auth: { persistSession: false } })

    // Student (limit(1), sin .single())
    const { data: stuRows, error: eStu } = await supabaseAdmin
      .from('students')
      .select('id, run, first_name, last_name, birthdate, gender, address, phone, nationality, photo_url, created_at')
      .eq('id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (eStu) throw eStu
    const student = stuRows?.[0] || null
    if (!student) {
      return NextResponse.json({ ok: false, error: 'Alumno no existe' }, { status: 404 })
    }

    // School year activo
    const { data: sys } = await supabaseAdmin
      .from('school_years')
      .select('id, year, active')
      .order('year', { ascending: false })
    const activeYear =
      (sys || []).find((y: any) => y.active)?.year || new Date().getFullYear()

    // Guardians
    const { data: links } = await supabaseAdmin
      .from('student_guardians')
      .select(`
        student_id, guardian_id, role,
        guardians ( id, run, first_name, last_name, email, phone, relationship, occupation )
      `)
      .eq('student_id', studentId)

    // Enrollment: año activo → última
    let enrollment: any = null
    const { data: efActRows } = await supabaseAdmin
      .from('enrollment_forms')
      .select('id, student_id, course_id, school_year, admission_number, admission_date, elective_subject_id, created_at')
      .eq('student_id', studentId)
      .eq('school_year', activeYear)
      .order('created_at', { ascending: false })
      .limit(1)
    enrollment = efActRows?.[0] || null

    if (!enrollment) {
      const { data: efLastRows } = await supabaseAdmin
        .from('enrollment_forms')
        .select('id, student_id, course_id, school_year, admission_number, admission_date, elective_subject_id, created_at')
        .eq('student_id', studentId)
        .order('school_year', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
      enrollment = efLastRows?.[0] || null
    }

    // Nombres de curso/electivo
    let courseName = '—'
    if (enrollment?.course_id) {
      const { data: cr } = await supabaseAdmin
        .from('courses')
        .select('id, name')
        .eq('id', enrollment.course_id)
        .limit(1)
      courseName = cr?.[0]?.name || '—'
    }

    let electiveName = '—'
    if (enrollment?.elective_subject_id) {
      const { data: sub } = await supabaseAdmin
        .from('subjects')
        .select('id, name, code')
        .eq('id', enrollment.elective_subject_id)
        .limit(1)
      electiveName = sub?.[0]?.name || '—'
    }

    return NextResponse.json({
      ok: true,
      student,
      student_guardians: links || [],
      enrollment,
      courseName,
      electiveName,
    })
  } catch (e: any) {
    // Pase lo que pase: SIEMPRE JSON (no HTML)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
