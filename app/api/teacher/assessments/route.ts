// app/api/teacher/assessments/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getUserIdFromCookie(): string | null {
  try {
    const token = cookies().get('sb-access-token')?.value
    if (!token) return null
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : ''
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    return payload?.sub || null
  } catch { return null }
}

function ok(data: any, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status })
}
function err(message: string, status = 400, debug?: any) {
  return NextResponse.json({ ok: false, error: message, ...(debug ? { debug } : {}) }, { status })
}

/** Helpers term SMALLINT: 0=S0,1=S1,2=S2 */
function toLabel(n: number | null | undefined): 'S0' | 'S1' | 'S2' | null {
  if (n === 0) return 'S0'
  if (n === 1) return 'S1'
  if (n === 2) return 'S2'
  return null
}
function parseTerm(input: any): 0 | 1 | 2 {
  const s = (input ?? '').toString().trim().toUpperCase()
  if (s === 'S1' || s === '1') return 1
  if (s === 'S2' || s === '2') return 2
  // S0 por defecto
  return 0
}

/** GET: lista evaluaciones */
export async function GET(req: Request) {
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return err('No hay sesión', 401)

    const url = new URL(req.url)
    const sCourse = url.searchParams.get('course_id')
    const sSubject = url.searchParams.get('subject_id')
    if (!sCourse || !sSubject) return ok({ items: [] })

    const course_id = Number(sCourse)
    const subject_id = Number(sSubject)
    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id)) {
      return err('Parámetros inválidos', 400, { course_id: sCourse, subject_id: sSubject })
    }

    // validar asignación
    const { data: vrows, error: verr } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', userId)
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .limit(1)
    if (verr) return err(verr.message)
    if (!vrows || vrows.length === 0) return ok({ items: [] })

    // traer assessments
    const { data, error } = await supabaseAdmin
      .from('assessments')
      .select('id, course_id, subject_id, title, name, date, weight, description, term')
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .order('date', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
    if (error) return err(error.message)

    // exponer "name" y label de term
    const items = (data ?? []).map((a: any) => ({
      ...a,
      name: a.name ?? a.title,
      term: toLabel(a.term),
    }))

    return ok({ items })
  } catch (e: any) {
    return err(e?.message || 'Error inesperado', 500)
  }
}

/** POST: crea evaluación (guarda name y title) con term SMALLINT 0/1/2 */
export async function POST(req: Request) {
  const dbg: any = {}
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return err('No hay sesión', 401)

    const raw = await req.text()
    let body: any = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { return err('Body inválido (no es JSON)', 400, { raw }) }

    let { course_id, subject_id, title, name, date, weight, description, term } = body || {}
    if (!title && name) title = name
    if (!name && title) name = title
    if (typeof course_id === 'string') course_id = Number(course_id)
    if (typeof subject_id === 'string') subject_id = Number(subject_id)
    if (typeof weight === 'string') weight = Number(weight)

    const titleTrim: string = (title ?? '').toString().trim()
    let termNum: 0 | 1 | 2 = parseTerm(term)
    dbg.body = { course_id, subject_id, titleTrim, date, weight, term, termNum }

    // Validaciones
    if (!Number.isFinite(course_id) || !Number.isFinite(subject_id)) return err('course_id y subject_id son obligatorios', 400, dbg)
    if (weight != null && (!Number.isFinite(weight) || weight < 0)) return err('weight inválido', 400, dbg)
    if (date != null) {
      const d = new Date(date)
      if (isNaN(d.getTime())) return err('date inválido (use YYYY-MM-DD)', 400, dbg)
    }

    // Validar asignación
    const { data: vrows, error: verr } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', userId)
      .eq('course_id', course_id)
      .eq('subject_id', subject_id)
      .limit(1)
    if (verr) return err(verr.message, 400, dbg)
    if (!vrows || vrows.length === 0) return err('No estás asignado a este curso/asignatura', 403, dbg)

    // Si no vino term explícito y viene fecha, intenta inferir S1/S2 según school_semesters
    if (!term && date) {
      const { data: courseRow } = await supabaseAdmin
        .from('courses')
        .select('id, school_year_id')
        .eq('id', course_id)
        .single()
      if (courseRow) {
        const { data: sems } = await supabaseAdmin
          .from('school_semesters')
          .select('number, start_date, end_date')
          .eq('school_year_id', courseRow.school_year_id)
        if (sems && sems.length) {
          const d = new Date(date)
          const hit = sems.find(s => new Date(s.start_date) <= d && d <= new Date(s.end_date))
          const n = (hit as any)?.number
          if (n === 1 || n === 2) termNum = n
        }
      }
    }
    dbg.termResolved = termNum

    // Duplicado explícito si hay título/name
    const titleForCheck = titleTrim
    if (titleForCheck) {
      const { count: dupCount, error: dupErr } = await supabaseAdmin
        .from('assessments')
        .select('id', { head: true, count: 'exact' })
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .eq('title', titleForCheck)
        .eq('term', termNum)
      dbg.dup = { dupCount, dupErr }
      if (dupErr) return err(dupErr.message, 400, dbg)
      if ((dupCount ?? 0) > 0) return err('Ya existe una evaluación con ese título en este término.', 409, dbg)
    }

    // Autogenerar título/name por término
    let finalTitle = titleTrim
    if (!finalTitle) {
      const { count, error: cntErr } = await supabaseAdmin
        .from('assessments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', course_id)
        .eq('subject_id', subject_id)
        .eq('term', termNum)
      dbg.autoname = { count, cntErr }
      if (cntErr) return err(cntErr.message, 400, dbg)
      finalTitle = `Evaluación ${(count ?? 0) + 1}`
    }
    const finalName = (name ?? '').toString().trim() || finalTitle
    dbg.final = { finalTitle, finalName }

    // Insert: GUARDA AMBOS name y title
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('assessments')
      .insert({
        course_id,
        subject_id,
        title: finalTitle,
        name: finalName,          // evita NOT NULL en name
        date: date ?? null,
        weight: weight ?? null,
        description: (description ?? '').toString().trim() || null,
        term: termNum,            // SMALLINT 0/1/2
      })
      .select()
      .single()

    if (insErr) {
      const msg = insErr.message || ''
      if (msg.includes('uq_assessments_unique_in_term') || insErr.code === '23505') {
        return err('Título duplicado para este curso/asignatura y término. Cambia el título o el término.', 409, { ...dbg, insErr })
      }
      return err(msg || 'No se pudo insertar', 400, { ...dbg, insErr })
    }

    const item = { ...inserted, name: (inserted as any).name ?? (inserted as any).title, term: toLabel((inserted as any).term) }
    return ok({ item })
  } catch (e: any) {
    return err(e?.message || 'Error inesperado', 500, dbg)
  }
}
