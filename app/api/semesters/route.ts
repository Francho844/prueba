// app/api/semesters/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const courseId = Number(url.searchParams.get('course_id') || '')
    if (!Number.isFinite(courseId)) {
      return NextResponse.json({ ok: false, error: 'course_id inválido' }, { status: 400 })
    }

    const { data: course, error: cErr } = await supabaseAdmin
      .from('courses')
      .select('id, school_year_id')
      .eq('id', courseId)
      .single()
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 })

    const { data: sems, error: sErr } = await supabaseAdmin
      .from('school_semesters')
      .select('id, number, start_date, end_date')
      .eq('school_year_id', course.school_year_id)
      .order('number', { ascending: true })
    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, items: sems ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
