import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const courseCode = url.searchParams.get('course')?.trim() || ''
  const q = url.searchParams.get('q')?.trim() || ''

  // 1) Traer todos los course_subjects (hasta 2000 por si acaso)
  const { data: cs, error: eCS } = await supabaseAdmin
    .from('course_subjects')
    .select('course_id, subject_id, hours_per_week')
    .limit(2000)

  if (eCS) return NextResponse.json({ ok: false, error: eCS.message }, { status: 500 })
  if (!cs?.length) return NextResponse.json({ ok: true, items: [] })

  const subjectIds = Array.from(new Set(cs.map((r: any) => r.subject_id)))
  const courseIds  = Array.from(new Set(cs.map((r: any) => r.course_id)))

  // 2) Traer subjects y courses asociadas
  const [{ data: subs, error: eS }, { data: courses, error: eC }] = await Promise.all([
    supabaseAdmin.from('subjects')
      .select('id, code, name')
      .in('id', subjectIds),
    supabaseAdmin.from('courses')
      .select('id, code, name, school_year_id')
      .in('id', courseIds),
  ])
  if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 500 })
  if (eC) return NextResponse.json({ ok: false, error: eC.message }, { status: 500 })

  const sm = new Map((subs ?? []).map(s => [s.id, s]))
  const cm = new Map((courses ?? []).map(c => [c.id, c]))

  // 3) Armar items: un item por (curso, ramo)
  let items = cs.map((r: any) => {
    const s = sm.get(r.subject_id)
    const c = cm.get(r.course_id)
    return s && c ? {
      id: s.id,
      code: s.code,
      name: s.name,
      course_id: c.id,
      course: { id: c.id, code: c.code, name: c.name, school_year_id: c.school_year_id },
      hours_per_week: r.hours_per_week ?? null,
    } : null
  }).filter(Boolean) as any[]

  // Filtros
  if (q) {
    const needle = q.toLowerCase()
    items = items.filter(it =>
      (it.name ?? '').toLowerCase().includes(needle) ||
      (it.code ?? '').toLowerCase().includes(needle)
    )
  }
  if (courseCode) items = items.filter(it => it.course?.code === courseCode)

  // Orden bonito
  items.sort((a, b) => {
    const ay = a.course?.school_year_id ?? 0, by = b.course?.school_year_id ?? 0
    if (by !== ay) return by - ay
    const ac = a.course?.name ?? '', bc = b.course?.name ?? ''
    if (ac !== bc) return ac.localeCompare(bc, 'es')
    return (a.name ?? '').localeCompare(b.name ?? '', 'es')
  })

  return NextResponse.json({ ok: true, items })
}
