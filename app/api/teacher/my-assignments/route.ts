// app/api/teacher/my-assignments/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function decodeJwt(token: string): any | null {
  try {
    const [, p] = token.split('.')
    const norm = p.replace(/-/g,'+').replace(/_/g,'/')
    const pad = norm.length % 4 ? 4 - (norm.length % 4) : 0
    return JSON.parse(Buffer.from(norm + '='.repeat(pad), 'base64').toString('utf8'))
  } catch { return null }
}

export async function GET() {
  const c = cookies() // <- sin await
  const at = c.get('sb-access-token')?.value
  if (!at) return NextResponse.json({ ok: false, error: 'no_cookie' }, { status: 401 })
  const payload = decodeJwt(at)
  const teacherId = payload?.sub || payload?.user_id
  if (!teacherId) return NextResponse.json({ ok: false, error: 'no_user' }, { status: 401 })

  // IMPORTANTE: esto usa la vista v_teacher_course_subjects
  const { data, error } = await supabaseAdmin
    .from('v_teacher_course_subjects')
    .select('teacher_id,course_subject_id,course_id,course_code,course_name,school_year,subject_id,subject_code,subject_name')
    .eq('teacher_id', teacherId)
    .order('school_year', { ascending: false })
    .order('course_code', { ascending: true })
    .order('subject_name', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, items: data ?? [] })
}
