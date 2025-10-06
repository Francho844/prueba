'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import ExcelJS from 'exceljs'

type Subject = { id: number; name: string }
type Student = { id: string; first_name: string; last_name: string }
type Assessment = { id: number; subject_id: number }
type Grade = { assessment_id: number; student_id: string; grade: number | null }

export default function AveragesPage() {
  const searchParams = useSearchParams()
  const courseId = Number(searchParams.get('courseId') || '0')

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true); setError(null)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { window.location.href = '/login'; return }
        if (!courseId) { setError('Falta courseId en la URL'); setLoading(false); return }

        // Subjects
        const { data: subs, error: e1 } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('course_id', courseId)
          .order('name', { ascending: true })
        if (e1) throw e1
        setSubjects(subs ?? [])

        // Students
        const { data: enrolls, error: e2 } = await supabase
          .from('enrollments')
          .select('student_id, students(id, first_name, last_name)')
          .eq('course_id', courseId)
          .order('student_id')
        if (e2) throw e2
        const studs = (enrolls ?? []).map((r:any)=>r.students).filter(Boolean) as Student[]
        setStudents(studs)

        const subjectIds = (subs ?? []).map(s => s.id)
        if (subjectIds.length === 0 || studs.length === 0) {
          setAssessments([]); setGrades([]); setLoading(false); return
        }

        // Assessments
        const { data: aps, error: e3 } = await supabase
          .from('assessment_plans')
          .select('id, subject_id')
          .in('subject_id', subjectIds)
        if (e3) throw e3
        setAssessments(aps ?? [])

        const assessmentIds = (aps ?? []).map((a:any) => a.id)
        if (assessmentIds.length === 0) { setGrades([]); setLoading(false); return }

        // Grades
        const { data: grs, error: e4 } = await supabase
          .from('grades')
          .select('assessment_id, student_id, grade')
          .in('assessment_id', assessmentIds)
        if (e4) throw e4
        setGrades(grs ?? [])

        setLoading(false)
      } catch (err: any) {
        console.error('Averages error', err)
        setError(err?.message || String(err))
        setLoading(false)
      }
    }
    run()
  }, [courseId])

  const { rows, courseAvg } = useMemo(() => {
    const assessToSubject = new Map<number, number>()
    assessments.forEach(a => assessToSubject.set(a.id, a.subject_id))

    const mapByStudent: Record<string, Record<number, number[]>> = {}
    const allByStudent: Record<string, number[]> = {}

    grades.forEach(g => {
      if (g.grade == null) return
      const subj = assessToSubject.get(g.assessment_id)
      if (!subj) return
      mapByStudent[g.student_id] = mapByStudent[g.student_id] || {}
      mapByStudent[g.student_id][subj] = mapByStudent[g.student_id][subj] || []
      mapByStudent[g.student_id][subj].push(g.grade)

      allByStudent[g.student_id] = allByStudent[g.student_id] || []
      allByStudent[g.student_id].push(g.grade)
    })

    function round1(x: number) { return Math.round(x * 10) / 10 } // 6.25 -> 6.3

    const rows = students.map(st => {
      const perSubj: Record<number, string> = {}
      subjects.forEach(s => {
        const arr = mapByStudent[st.id]?.[s.id] || []
        if (arr.length === 0) perSubj[s.id] = '—'
        else {
          const avg = arr.reduce((a,b)=>a+b, 0) / arr.length
          perSubj[s.id] = round1(avg).toFixed(1)
        }
      })
      const all = allByStudent[st.id] || []
      const overall = all.length ? round1(all.reduce((a,b)=>a+b,0)/all.length).toFixed(1) : '—'
      return { student: st, perSubj, overall }
    })

    const overallVals = rows.map(r => Number(r.overall)).filter(v => !Number.isNaN(v))
    const courseAvg = overallVals.length ? round1(overallVals.reduce((a,b)=>a+b,0)/overallVals.length).toFixed(1) : '—'

    return { rows, courseAvg }
  }, [subjects, students, assessments, grades])

  const downloadExcel = async () => {
    const headers = ['Estudiante', ...subjects.map(s => s.name), 'Promedio general']
    const data: (string | number)[][] = rows.map(row => {
      const fullName = `${row.student.last_name}, ${row.student.first_name}`
      return [fullName, ...subjects.map(s => row.perSubj[s.id]), row.overall]
    })
    data.push([]) // fila en blanco
    data.push(['Promedio del curso', courseAvg])

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Promedios')

    ws.addRow(headers)
    ws.getRow(1).font = { bold: true }

    data.forEach(r => ws.addRow(r))

    const colCount = headers.length
    for (let i = 1; i <= colCount; i++) {
      ws.getColumn(i).width = 22
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promedios_curso_${courseId}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <a href={`/dashboard`} className="rounded border px-3 py-1">← Volver</a>
        <h1 className="text-lg font-semibold">Promedios por asignatura — Curso #{courseId}</h1>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">Error: {error}</p>}

      {!loading && (
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-xl border bg-white p-3">
            <strong>Promedio del curso:</strong> {courseAvg}
          </div>
          <button onClick={downloadExcel} className="rounded bg-black px-3 py-1 text-white">
            Descargar Excel
          </button>
        </div>
      )}

      {loading ? <p>Cargando…</p> : (
        <div className="overflow-auto rounded-2xl border bg-white p-4 shadow">
          {subjects.length === 0 ? <p>Este curso no tiene asignaturas.</p> : (
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="text-left">
                  <th className="w-64 p-2">Estudiante</th>
                  {subjects.map(s => (
                    <th key={s.id} className="p-2">{s.name}</th>
                  ))}
                  <th className="p-2">Promedio general</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.student.id} className="border-t">
                    <td className="p-2">{row.student.last_name}, {row.student.first_name}</td>
                    {subjects.map(s => (
                      <td key={s.id} className="p-2">{row.perSubj[s.id]}</td>
                    ))}
                    <td className="p-2 font-medium">{row.overall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
