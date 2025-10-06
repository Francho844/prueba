import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { teacher_id: string, subject_ids: number[] }
    if (!body?.teacher_id || !Array.isArray(body.subject_ids) || body.subject_ids.length === 0) {
      return NextResponse.json({ ok: false, error: 'Parámetros inválidos' }, { status: 400 })
    }
    const rows = body.subject_ids.map(subject_id => ({ teacher_id: body.teacher_id, subject_id }))

    // Inserta; si tienes UNIQUE(subject_id, teacher_id) puede fallar duplicado: lo ignoramos con minimal manejo
    const { error } = await supabaseAdmin
      .from('teacher_subjects')
      .insert(rows, { returning: 'minimal' })

    if (error && !/duplicate/i.test(error.message)) {
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
  const subject_id = url.searchParams.get('subject_id')
  if (!teacher_id || !subject_id) {
    return NextResponse.json({ ok: false, error: 'Falta teacher_id o subject_id' }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from('teacher_subjects')
    .delete()
    .eq('teacher_id', teacher_id)
    .eq('subject_id', Number(subject_id))

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
export async function GET(req: Request) {
  const url = new URL(req.url)
  const teacher = url.searchParams.get('teacher')
  if (!teacher) return NextResponse.json({ ok: false, error: 'Missing teacher' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('teacher_subjects')
    .select('subject_id')
    .eq('teacher_id', teacher)
    .limit(2000)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, subject_ids: (data ?? []).map(x => x.subject_id) })
}