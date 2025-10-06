import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { student_ids: string[] }
    const ids = (Array.isArray(body?.student_ids) ? body.student_ids : []).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Sin student_ids' }, { status: 400 })

    // Hacemos delete en orden seguro
    const tables = [
      { name: 'grades',            col: 'student_id' },
      { name: 'attendance_marks',  col: 'student_id' },
      { name: 'student_guardians', col: 'student_id' },
      { name: 'enrollments',       col: 'student_id' },
      { name: 'enrollment_forms',  col: 'student_id' },
      { name: 'behavior_logs',     col: 'student_id' },
    ]

    for (const t of tables) {
      const { error } = await supabaseAdmin.from(t.name).delete().in(t.col, ids)
      if (error) return NextResponse.json({ ok: false, error: `${t.name}: ${error.message}` }, { status: 500 })
    }

    const { error: delStudentsErr } = await supabaseAdmin.from('students').delete().in('id', ids)
    if (delStudentsErr) return NextResponse.json({ ok: false, error: delStudentsErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, deleted: ids.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error' }, { status: 500 })
  }
}
