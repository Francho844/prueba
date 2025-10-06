// app/api/teacher/assessments/[id]/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

/** PUT: editar { name?, date?, weight?, description?, semester_id? } */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const id = Number(params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    let { name, date, weight, description, semester_id } = body || {}

    if (typeof weight === 'string') weight = Number(weight)
    if (typeof semester_id === 'string') semester_id = Number(semester_id)
    const nameTrim = (name ?? undefined) === undefined ? undefined : String(name).trim()
    const dateNorm = (date ?? undefined) === undefined ? undefined : String(date)
    let weightNorm: number | null | undefined = undefined
    if (weight !== undefined) {
      weightNorm = (weight === '' || weight === null) ? null : Number(weight)
      if (weightNorm !== null && (!Number.isFinite(weightNorm) || weightNorm < 0)) {
        return NextResponse.json({ ok: false, error: 'weight inválido' }, { status: 400 })
      }
    }
    const descTrim = (description ?? undefined) === undefined ? undefined : (String(description).trim() || null)

    // cargar evaluación + validar asignación docente
    const { data: ev, error: e1 } = await supabaseAdmin
      .from('assessments')
      .select('id, course_id, subject_id')
      .eq('id', id)
      .single()
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 })
    if (!ev) return NextResponse.json({ ok: false, error: 'Evaluación no encontrada' }, { status: 404 })

    const { data: vrows, error: verr } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', userId)
      .eq('course_id', ev.course_id)
      .eq('subject_id', ev.subject_id)
      .limit(1)
    if (verr) return NextResponse.json({ ok: false, error: verr.message }, { status: 400 })
    if (!vrows || vrows.length === 0) return NextResponse.json({ ok: false, error: 'No puedes editar esta evaluación' }, { status: 403 })

    // si mandan semester_id, validar que pertenezca al mismo school_year
    let semesterIdToSave: number | undefined
    if (semester_id !== undefined && semester_id !== null) {
      const { data: courseRow, error: cErr } = await supabaseAdmin
        .from('courses')
        .select('id, school_year_id')
        .eq('id', ev.course_id)
        .single()
      if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 })

      const { data: sem, error: sErr } = await supabaseAdmin
        .from('school_semesters')
        .select('id, school_year_id')
        .eq('id', semester_id)
        .single()
      if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
      if (!sem || sem.school_year_id !== courseRow.school_year_id) {
        return NextResponse.json({ ok: false, error: 'semester_id no corresponde al año del curso' }, { status: 400 })
      }
      semesterIdToSave = semester_id
    } else if (semester_id === null) {
      // permitir borrar el semestre explícitamente
      semesterIdToSave = null as any
    }

    if (nameTrim !== undefined && nameTrim.length === 0) {
      return NextResponse.json({ ok: false, error: 'El nombre no puede quedar vacío' }, { status: 400 })
    }

    const patch: Record<string, any> = {}
    if (nameTrim !== undefined) patch.name = nameTrim
    if (dateNorm !== undefined) patch.date = dateNorm || null
    if (weight !== undefined) patch.weight = weightNorm
    if (descTrim !== undefined) patch.description = descTrim
    if (semesterIdToSave !== undefined) patch.semester_id = semesterIdToSave

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nada para actualizar' }, { status: 400 })
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('assessments')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, item: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}

/** DELETE (igual que ya tenías) */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = getUserIdFromCookie()
    if (!userId) return NextResponse.json({ ok: false, error: 'No hay sesión' }, { status: 401 })

    const id = Number(params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })

    const { data: ev, error: e1 } = await supabaseAdmin
      .from('assessments')
      .select('id, course_id, subject_id')
      .eq('id', id)
      .single()
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 })
    if (!ev) return NextResponse.json({ ok: false, error: 'Evaluación no encontrada' }, { status: 404 })

    const { data: vrows, error: verr } = await supabaseAdmin
      .from('v_teacher_course_subjects')
      .select('course_id, subject_id')
      .eq('teacher_id', userId)
      .eq('course_id', ev.course_id)
      .eq('subject_id', ev.subject_id)
      .limit(1)
    if (verr) return NextResponse.json({ ok: false, error: verr.message }, { status: 400 })
    if (!vrows || vrows.length === 0) return NextResponse.json({ ok: false, error: 'No puedes eliminar esta evaluación' }, { status: 403 })

    const { error: delErr } = await supabaseAdmin.from('assessments').delete().eq('id', id)
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
