'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Subject = { id: number; name: string; code: string }
type Student = { id: string; first_name: string; last_name: string }
type Assessment = { id: number; name: string; due_date: string | null }

export default function GradesPage() {
  const url = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost')
  const courseId = Number(url.searchParams.get('courseId') || '0')

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState<number | null>(null)

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [assessmentId, setAssessmentId] = useState<number | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true); setError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }

      const { data: subs, error: e1 } = await supabase
        .from('subjects')
        .select('id, name, code')
        .eq('course_id', courseId)
        .order('name', { ascending: true })
      if (e1) { setError(e1.message); setLoading(false); return }
      setSubjects(subs ?? [])
      if ((subs ?? []).length && !subjectId) setSubjectId(subs![0].id)

      const { data: enrolls, error: e2 } = await supabase
        .from('enrollments')
        .select('student_id, students(id, first_name, last_name)')
        .eq('course_id', courseId)
        .order('student_id')
      if (e2) { setError(e2.message); setLoading(false); return }
      const studs = (enrolls ?? []).map((r:any)=>r.students).filter(Boolean) as Student[]
      setStudents(studs)

      setLoading(false)
    }
    if (courseId) run()
  }, [courseId])

  useEffect(() => {
    const run = async () => {
      if (!subjectId) return
      const { data, error } = await supabase
        .from('assessment_plans')
        .select('id, name, due_date')
        .eq('subject_id', subjectId)
        .order('due_date', { ascending: true })
      if (!error) setAssessments(data ?? [])
    }
    run()
  }, [subjectId])

  useEffect(() => {
    const run = async () => {
      if (!assessmentId) return
      const { data, error } = await supabase
        .from('grades')
        .select('student_id, grade')
        .eq('assessment_id', assessmentId)
      if (!error) {
        const map: Record<string,string> = {}
        ;(data ?? []).forEach((g:any)=>{ map[g.student_id] = String(g.grade ?? '') })
        setGrades(map)
      }
    }
    run()
  }, [assessmentId])

  const addAssessment = async (form: FormData) => {
    const name = String(form.get('name') || '').trim()
    const due_date = String(form.get('due_date') || '') || null
    if (!subjectId || !name) return
    const { data, error } = await supabase.from('assessment_plans')
      .insert({ subject_id: subjectId, name, due_date })
      .select('id, name, due_date')
      .single()
    if (!error && data) {
      setAssessments(prev => [...prev, data as any])
      setAssessmentId(data.id)
    }
  }

  const saveGrade = async (studentId: string, value: string) => {
    if (!assessmentId) { setError('Primero selecciona o crea una evaluación.'); return }
    setSaving(true)
    const v = value ? Number(value.replace(',', '.')) : null
    if (v !== null && (v < 1.0 || v > 7.0)) {
      setError('La nota debe estar entre 1.0 y 7.0')
      setSaving(false)
      return
    }
    setError(null)
    setGrades(prev => ({ ...prev, [studentId]: value }))
    const { error } = await supabase.from('grades').upsert(
      { assessment_id: assessmentId, student_id: studentId, grade: v },
      { onConflict: 'assessment_id,student_id' }
    )
    if (error) setError(error.message)
    setSaving(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <a href="/dashboard" className="rounded border px-3 py-1">← Volver</a>

        <div>
          <label className="block text-sm">Asignatura</label>
          <select value={subjectId ?? ''} onChange={e=>setSubjectId(Number(e.target.value))} className="rounded border px-2 py-1">
            {(subjects ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm">Evaluación</label>
          <select value={assessmentId ?? ''} onChange={e=>setAssessmentId(Number(e.target.value))} className="rounded border px-2 py-1">
            <option value="">-- Selecciona --</option>
            {assessments.map(a => <option key={a.id} value={a.id}>{a.name}{a.due_date ? ` (${a.due_date})` : ''}</option>)}
          </select>
        </div>

        {saving && <span className="text-sm">Guardando…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">Crear evaluación</h2>
        <form action={addAssessment} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm">Nombre</label>
            <input name="name" className="rounded border px-2 py-1" placeholder="Prueba 1" />
          </div>
          <div>
            <label className="block text-sm">Fecha</label>
            <input name="due_date" type="date" className="rounded border px-2 py-1" />
          </div>
          <button className="rounded bg-black px-3 py-1 text-white">Agregar</button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">Ingreso de notas</h2>
        {!assessmentId ? <p>Primero selecciona una evaluación.</p> : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-1/2 p-2">Estudiante</th>
                <th className="w-1/4 p-2">Nota (1.0 — 7.0)</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.last_name}, {s.first_name}</td>
                  <td className="p-2">
                    <input
                      className="w-24 rounded border px-2 py-1"
                      value={grades[s.id] ?? ''}
                      onChange={e=>saveGrade(s.id, e.target.value)}
                      placeholder="6.5"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
