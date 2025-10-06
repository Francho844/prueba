import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const courseCode = url.searchParams.get('course')?.trim() || ''
  const q = url.searchParams.get('q')?.trim() || ''

  // Traer course_subjects + joins
  const { data: cs, error: eCS } = await supabaseAdmin
    .from('course_subjects')
    .select('id, course_id, subject_id, hours_per_week')
    .limit(5000)
  if (eCS) return NextResponse.json({ ok: false, error: eCS.message }, { status: 500 })

  if (!cs?.length) return NextResponse.json({ ok: true, items: [] })

  const courseIds = Array.from(new Set(cs.map((r:any)=>r.course_id)))
  const subjectIds = Array.from(new Set(cs.map((r:any)=>r.subject_id)))

  const [{ data: courses, error: eC }, { data: subjects, error: eS }] = await Promise.all([
    supabaseAdmin.from('courses').select('id, code, name, school_year_id').in('id', courseIds),
    supabaseAdmin.from('subjects').select('id, code, name').in('id', subjectIds)
  ])
  if (eC) return NextResponse.json({ ok: false, error: eC.message }, { status: 500 })
  if (eS) return NextResponse.json({ ok: false, error: eS.message }, { status: 500 })

  const cm = new Map((courses ?? []).map(c => [c.id, c]))
  const sm = new Map((subjects ?? []).map(s => [s.id, s]))

  let items = (cs ?? []).map((r:any) => {
    const c = cm.get(r.course_id)
    const s = sm.get(r.subject_id)
    return (c && s) ? {
      id: r.id,                       // <-- course_subjects.id
      course: { id: c.id, code: c.code, name: c.name, school_year_id: c.school_year_id },
      subject: { id: s.id, code: s.code, name: s.name },
      hours_per_week: r.hours_per_week ?? null
    } : null
  }).filter(Boolean) as any[]

  if (q) {
    const needle = q.toLowerCase()
    items = items.filter(it =>
      (it.subject?.name ?? '').toLowerCase().includes(needle) ||
      (it.subject?.code ?? '').toLowerCase().includes(needle)
    )
  }
  if (courseCode) items = items.filter(it => it.course?.code === courseCode)

  items.sort((a,b) => {
    const ay = a.course?.school_year_id ?? 0, by = b.course?.school_year_id ?? 0
    if (by !== ay) return by - ay
    const ac = a.course?.name ?? '', bc = b.course?.name ?? ''
    if (ac !== bc) return ac.localeCompare(bc, 'es')
    return (a.subject?.name ?? '').localeCompare(b.subject?.name ?? '', 'es')
  })

  return NextResponse.json({ ok: true, items })
}
