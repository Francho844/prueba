// app/api/teacher/my-subjects/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function decodeJwt(token: string): any | null {
  try {
    const [_, payload] = token.split('.')
    const norm = payload.replace(/-/g,'+').replace(/_/g,'/')
    const pad = norm.length % 4 ? 4 - (norm.length % 4) : 0
    return JSON.parse(Buffer.from(norm + '='.repeat(pad), 'base64').toString('utf8'))
  } catch { return null }
}

export async function GET() {
  const c = await cookies()
  const at = c.get('sb-access-token')?.value
  if (!at) return NextResponse.json({ ok: false, error: 'no_cookie' }, { status: 401 })
  const payload = decodeJwt(at)
  const teacherId = payload?.sub || payload?.user_id
  if (!teacherId) return NextResponse.json({ ok: false, error: 'no_user' }, { status: 401 })

  const { data: ts, error } = await supabaseAdmin
    .from('teacher_subjects')
    .select('subject_id')
    .eq('teacher_id', teacherId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const subjectIds = (ts ?? []).map(x => x.subject_id)
  if (!subjectIds.length) return NextResponse.json({ ok: true, items: [] })

  const { data: subs } = await supabaseAdmin
    .from('subjects')
    .select('id, code, name, course_id')
    .in('id', subjectIds)

  const courseIds = Array.from(new Set((subs ?? []).map(s => s.course_id)))
  const [{ data: courses }] = await Promise.all([
    supabaseAdmin.from('courses').select('id, code, name, school_year_id').in('id', courseIds),
  ])

  const coursesMap = new Map((courses ?? []).map(c => [c.id, c]))
  const items = (subs ?? []).map(s => ({
    subject_id: s.id,
    subject_code: s.code,
    subject_name: s.name,
    course: coursesMap.get(s.course_id),
  }))

  return NextResponse.json({ ok: true, items })
}
