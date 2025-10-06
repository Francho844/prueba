// app/api/teacher/estudiantes/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase' // Ajusta al helper que ya usas

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 })
  }

  try {
    // 1) Estudiante
    const { data: student, error: eStudent } = await supabaseAdmin
      .from('students')
      .select('id, run, first_name, last_name, gender, birth_date, address, phone, email')
      .eq('id', id)
      .single()

    if (eStudent || !student) {
      return NextResponse.json({ ok: false, error: 'Estudiante no encontrado' }, { status: 404 })
    }

    // 2) Última matrícula (ajusta nombres si difieren)
    const { data: enrollment, error: eEnroll } = await supabaseAdmin
      .from('enrollments')
      .select('id, course_id, created_at, courses(id, code, name, school_year_id)')
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 3) Apoderados
    const { data: guardians, error: eGuard } = await supabaseAdmin
      .from('student_guardians')
      .select('relationship, guardians(id, run, first_name, last_name, phone, email)')
      .eq('student_id', id)

    if (eEnroll) console.error('enrollments error:', eEnroll)
    if (eGuard) console.error('guardians error:', eGuard)

    return NextResponse.json({
      ok: true,
      student,
      course: enrollment?.courses ?? null,
      guardians: (guardians ?? []).map(g => ({
        relationship: g.relationship,
        guardian: g.guardians
      }))
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
