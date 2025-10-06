'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, RefreshCcw, ArrowLeft } from 'lucide-react'

type PageProps = { params: { courseId: string; subjectId: string } }

type Student = { id: string; first_name: string | null; last_name: string | null }
type Assessment = { id: number; name: string; date: string | null; weight: number | null; semester_number: number | null }
type Mark = { assessment_id: number; student_id: string; mark: number }

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60 ' + className}
      {...props}
    >
      {children}
    </button>
  )
}

export default function LibroPage({ params }: PageProps) {
  const courseId = Number(params.courseId)
  const subjectId = Number(params.subjectId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [cells, setCells] = useState<Record<string, string>>({}) // key = `${sid}:${aid}` -> string (input)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true); setError(null); setOkMsg(null)
    try {
      const res = await fetch(`/api/teacher/grades?course_id=${courseId}&subject_id=${subjectId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo cargar')

      setStudents(json.students || [])
      setAssessments(json.assessments || [])

      const map: Record<string, string> = {}
      for (const m of (json.marks || []) as Mark[]) {
        map[`${m.student_id}:${m.assessment_id}`] = String(m.mark)
      }
      setCells(map)
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Error cargando datos')
      setStudents([]); setAssessments([]); setCells({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [courseId, subjectId])

  function setCell(sid: string, aid: number, val: string) {
    setCells(prev => ({ ...prev, [`${sid}:${aid}`]: val }))
    setDirty(true)
  }

  const avgsByStudent = useMemo(() => {
    const out = new Map<string, number>()
    for (const s of students) {
      let sum = 0, cnt = 0
      for (const a of assessments) {
        const v = cells[`${s.id}:${a.id}`]
        if (v !== undefined && v !== '') {
          const num = Number(v)
          if (Number.isFinite(num)) { sum += num; cnt++ }
        }
      }
      out.set(s.id, cnt ? Number((sum / cnt).toFixed(2)) : NaN)
    }
    return out
  }, [students, assessments, cells])

  const avgsByAssessment = useMemo(() => {
    const out = new Map<number, number>()
    for (const a of assessments) {
      let sum = 0, cnt = 0
      for (const s of students) {
        const v = cells[`${s.id}:${a.id}`]
        if (v !== undefined && v !== '') {
          const num = Number(v)
          if (Number.isFinite(num)) { sum += num; cnt++ }
        }
      }
      out.set(a.id, cnt ? Number((sum / cnt).toFixed(2)) : NaN)
    }
    return out
  }, [students, assessments, cells])

  async function saveAll() {
    setSaving(true); setError(null); setOkMsg(null)
    try {
      const payloadMarks: { assessment_id: number; student_id: string; mark: number }[] = []
      for (const s of students) {
        for (const a of assessments) {
          const raw = cells[`${s.id}:${a.id}`]
          if (raw === undefined || raw === '') continue
          const mk = Number(raw)
          if (!Number.isFinite(mk)) continue
          payloadMarks.push({ assessment_id: a.id, student_id: s.id, mark: mk })
        }
      }
      const res = await fetch('/api/teacher/grades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, subject_id: subjectId, marks: payloadMarks }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo guardar')
      setOkMsg('Notas guardadas')
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Libro de clases (planilla)</h1>
          <p className="text-sm text-slate-600">
            Curso <span className="font-mono">#{courseId}</span> · Asignatura <span className="font-mono">#{subjectId}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = `/teacher/cursos/${courseId}/asignaturas/${subjectId}`)} className="bg-gray-600 hover:bg-gray-700">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <Button onClick={loadAll}><RefreshCcw className="h-4 w-4" /> Recargar</Button>
          <Button onClick={saveAll} disabled={saving || !dirty}>
            {saving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>) : (<><Save className="h-4 w-4" /> Guardar todo</>)}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-3 overflow-auto">
        {loading ? (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : students.length === 0 ? (
          <div className="text-sm text-slate-500">No hay alumnos asignados al curso.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-white z-10 text-left py-2 pr-3">Alumno</th>
                {assessments.map(a => (
                  <th key={a.id} className="text-left py-2 px-2 whitespace-nowrap">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.date || '—'} {a.semester_number ? `· S${a.semester_number}` : ''} {a.weight != null ? `· ${a.weight}` : ''}
                    </div>
                  </th>
                ))}
                <th className="text-left py-2 pl-3">Prom.</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="sticky left-0 bg-white z-10 py-2 pr-3 whitespace-nowrap">
                    {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.id}
                  </td>
                  {assessments.map(a => {
                    const key = `${s.id}:${a.id}`
                    const val = cells[key] ?? ''
                    return (
                      <td key={key} className="py-2 px-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={1} max={7} step={0.1}
                          className="w-20 rounded border px-2 py-1"
                          value={val}
                          onChange={(e) => setCell(s.id, a.id, e.target.value)}
                        />
                      </td>
                    )
                  })}
                  <td className="py-2 pl-3 font-medium">
                    {Number.isFinite(avgsByStudent.get(s.id)!) ? avgsByStudent.get(s.id) : '—'}
                  </td>
                </tr>
              ))}
              {/* Fila de promedios por evaluación */}
              <tr>
                <td className="sticky left-0 bg-white z-10 py-2 pr-3 text-slate-600">Prom. evaluación</td>
                {assessments.map(a => (
                  <td key={a.id} className="py-2 px-2 text-slate-700">
                    {Number.isFinite(avgsByAssessment.get(a.id)!) ? avgsByAssessment.get(a.id) : '—'}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="text-sm">
        {error && <div className="text-rose-700">Error: {error}</div>}
        {okMsg && <div className="text-emerald-700">{okMsg}</div>}
        {dirty && <div className="text-amber-700">Tienes cambios sin guardar.</div>}
      </div>
    </div>
  )
}
