import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const teacher = url.searchParams.get('teacher')
  if (!teacher) return NextResponse.json({ ok: false, error: 'Missing teacher' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('teaching_assignments')
    .select('course_subject_id')
    .eq('teacher_id', teacher)
    .limit(5000)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cs_ids: (data ?? []).map(x => x.course_subject_id) })
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { teacher_id: string, cs_ids: number[] }
    if (!body?.teacher_id || !Array.isArray(body.cs_ids) || body.cs_ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'Parámetros inválidos' }, { status: 400 })
    }
    const rows = body.cs_ids.map(id => ({ teacher_id: body.teacher_id, course_subject_id: id }))
    const { error } = await supabaseAdmin
      .from('teaching_assignments')
      .insert(rows, { returning: 'minimal' })

    if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const teacher_id = url.searchParams.get('teacher_id')
  const cs_id = url.searchParams.get('cs_id')
  if (!teacher_id || !cs_id) {
    return NextResponse.json({ ok: false, error: 'Falta teacher_id o cs_id' }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from('teaching_assignments')
    .delete()
    .eq('teacher_id', teacher_id)
    .eq('course_subject_id', Number(cs_id))

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
