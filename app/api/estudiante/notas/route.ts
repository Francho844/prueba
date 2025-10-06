// app/api/estudiante/notas/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supa = createClient(URL, SRK)

// --- helpers jwt
function bearerFrom(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}
function decodeJwt(jwt?: string | null): any | null {
  if (!jwt) return null
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try { return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) } catch { return null }
}

// --- helpers RUN
function cleanRun(s?: string | null): string | null {
  if (!s) return null
  const t = s.trim().replace(/\s+/g, '').replace(/\./g, '').toUpperCase()
  // si ya trae guion, normaliza
  if (t.includes('-')) {
    const [n, dv] = t.split('-')
    const num = n.replace(/\D/g, '')
    const cdv = (dv || '').replace(/[^0-9K]/g, '')
    if (!num || !cdv) return null
    return `${num}-${cdv}`
  }
  // sin guion: último char es DV
  const body = t.slice(0, -1).replace(/\D/g, '')
  const dv = t.slice(-1).replace(/[^0-9K]/g, '')
  if (!body || !dv) return null
  return `${body}-${dv}`
}
function runCandidates(raw?: string | null): string[] {
  const c = cleanRun(raw)
  if (!c) return []
  const [num, dv] = c.split('-')
  const dotted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return Array.from(new Set([
    c,                               // 12345678-9
    `${num}${dv}`,                   // 123456789
    `${dotted}-${dv}`,               // 12.345.678-9
    `${num}-${dv.toLowerCase()}`,    // dv en minúscula
    `${dotted}-${dv.toLowerCase()}`,
  ]))
}

export async function GET(req: Request) {
  try {
    // 0) auth
    const jar = cookies()
    const raw = jar.get('sb-access-token')?.value || bearerFrom(req)
    const payload = decodeJwt(raw)
    const userId: string | undefined = payload?.sub
    const userEmail: string | undefined = payload?.email
    if (!userId) return NextResponse.json({ ok:false, error:'No autenticado' }, { status:401 })

    // 1) buscar alumno por user_id
    let { data: student } = await supa
      .from('students')
      .select('id, first_name, last_name, run, user_id')
      .eq('user_id', userId)
      .maybeSingle()

    // 2) si no hay, intentar por RUN derivado del email o app_users
    if (!student) {
      // a) del email del token (local-part)
      const local = (userEmail || '').split('@')[0] || ''
      const candFromEmail = runCandidates(local)

      // b) de app_users.rut
      const { data: appUser } = await supa
        .from('app_users')
        .select('id, rut, email')
        .eq('id', userId)
        .maybeSingle()
      const candFromApp = runCandidates(appUser?.rut)

      const allCands = Array.from(new Set([...candFromEmail, ...candFromApp])).filter(Boolean)
      if (allCands.length) {
        const { data: st2 } = await supa
          .from('students')
          .select('id, first_name, last_name, run, user_id')
          .in('run', allCands as string[])
          .limit(1)
        if (st2 && st2.length) student = st2[0]
      }
    }

    if (!student) {
      return NextResponse.json({ ok:false, error:'Alumno no encontrado' }, { status:404 })
    }

    // 3) año activo o último
    const { data: sys } = await supa
      .from('school_years')
      .select('id, year, active')
      .order('year', { ascending: false })
    const activeYear = (sys || []).find((y:any)=>y.active)?.year ?? (sys?.[0]?.year ?? new Date().getFullYear())

    // 4) matrícula
    let enroll: { id:number; course_id:number|null; school_year:number } | null = null
    const { data: efAct } = await supa
      .from('enrollment_forms')
      .select('id, course_id, school_year')
      .eq('student_id', student.id)
      .eq('school_year', activeYear)
      .maybeSingle()
    enroll = efAct || null
    if (!enroll) {
      const { data: efLast } = await supa
        .from('enrollment_forms')
        .select('id, course_id, school_year')
        .eq('student_id', student.id)
        .order('school_year', { ascending: false })
        .limit(1)
        .maybeSingle()
      enroll = efLast || null
    }
    if (!enroll || !enroll.course_id) {
      return NextResponse.json({ ok:true, student, course:null, school_year:activeYear, subjects:[] }, { status:200 })
    }

    // 5) curso
    const { data: course } = await supa
      .from('courses')
      .select('id, name, code, school_year_id')
      .eq('id', enroll.course_id)
      .maybeSingle()

    // 6) evaluaciones
    const { data: assessments } = await supa
      .from('assessments')
      .select('id, name, date, weight, term, subject_id')
      .eq('course_id', enroll.course_id)
      .order('date', { ascending: true })

    const assess = (assessments || []).filter((a:any)=> a && a.subject_id != null)
    const assessIds = assess.map((a:any)=> a.id as number)
    const subjIds = Array.from(new Set(assess.map((a:any)=> a.subject_id as number)))

    // 7) subjects
    const subjectsMap = new Map<number,{id:number;name:string;code:string|null}>()
    if (subjIds.length) {
      const { data: subs } = await supa
        .from('subjects')
        .select('id, name, code')
        .in('id', subjIds as number[])
      for (const s of subs || []) subjectsMap.set(s.id, { id:s.id, name:s.name, code:s.code ?? null })
    }

    // 8) notas — soportar marks.student_id = students.id o = app_users.id
    const studentKeys = [student.id, student.user_id].filter(Boolean) as string[]
    const marksQuery = supa
      .from('marks')
      .select('assessment_id, student_id, mark')
      .in('assessment_id', assessIds as number[])

    let marksData: any[] = []
    if (studentKeys.length === 1) {
      const { data: m } = await marksQuery.eq('student_id', studentKeys[0])
      marksData = m || []
    } else {
      const { data: m } = await marksQuery.in('student_id', studentKeys as string[])
      marksData = m || []
    }
    const marksMap = new Map<number, number>()
    for (const m of marksData) {
      const val = typeof m.mark === 'string' ? Number(String(m.mark).replace(',', '.')) : Number(m.mark)
      if (Number.isFinite(val)) marksMap.set(m.assessment_id, val)
    }

    // 9) agrupar por asignatura
    const bySubject = new Map<number, {
      id:number; name:string; code:string|null;
      assessments: { id:number; name:string; date:string|null; weight:number|null; term:any; mark:number|null }[]
    }>()
    for (const a of assess) {
      const sId = a.subject_id as number
      const subjInfo = subjectsMap.get(sId) || { id:sId, name:`Asignatura #${sId}`, code:null }
      if (!bySubject.has(sId)) bySubject.set(sId, { id:subjInfo.id, name:subjInfo.name, code:subjInfo.code, assessments:[] })
      bySubject.get(sId)!.assessments.push({
        id: a.id, name: a.name, date: a.date, weight: a.weight ?? null, term: a.term ?? null,
        mark: marksMap.has(a.id) ? marksMap.get(a.id)! : null,
      })
    }

    const subjectsOut: Array<{
      id:number; name:string; code:string|null;
      assessments: { id:number; name:string; date:string|null; weight:number|null; term:any; mark:number|null }[]
    }> = []
    for (const [,block] of bySubject) {
      block.assessments.sort((x,y)=> {
        const dx = x.date || '', dy = y.date || ''
        if (dx !== dy) return dx.localeCompare(dy)
        return x.name.localeCompare(y.name,'es')
      })
      subjectsOut.push(block)
    }

    return NextResponse.json({
      ok: true,
      student,
      course: course || null,
      school_year: enroll.school_year,
      subjects: subjectsOut.sort((a,b)=> a.name.localeCompare(b.name,'es')),
    }, { status:200 })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'Error' }, { status:500 })
  }
}
