'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Informe oficial (misma distribución del PDF):
 * - Encabezado y decretos.
 * - Ficha alumno (sin birth_date).
 * - Tabla 01..17 + P-2, P-1, PF.
 * - Orientación "I".
 * - Apreciación final, asistencia, promoción, observaciones y firmas.
 *
 * URL: /report-card-official?courseId=..&studentId=..&semester=1|2
 */

type Student = { id: string; first_name: string; last_name: string; run?: string | null }
type Course  = { id: number; code: string; name: string }
type Subject = { id: number; name: string }
type Assessment = { id: number; subject_id: number; name: string | null; due_date: string | null; semester?: number | null }
type Grade = { assessment_id: number; grade: number | null }
type Teacher = { id: string; full_name: string | null }

function round1(x: number) { return Math.round(x * 10) / 10 }
function semesterMonths(sem: number) { return sem === 1 ? [3,4,5,6,7] : [8,9,10,11,12] }

export default function ReportCardOfficial() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const courseId  = Number(searchParams.get('courseId') || '0')
  const studentId = String(searchParams.get('studentId') || '')
  const semester  = Number(searchParams.get('semester') || '1')

  const [student, setStudent] = useState<Student | null>(null)
  const [course, setCourse]   = useState<Course | null>(null)
  const [profJefe, setProfJefe] = useState<Teacher | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [attendance, setAttendance] = useState<{worked:number; attended:number; absent:number; pct:string} | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true); setError(null)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { window.location.href = '/login'; return }
        if (!courseId || !studentId || ![1,2].includes(semester)) {
          setError('Faltan parámetros: courseId, studentId o semester (1|2).')
          setLoading(false); return
        }

        // Alumno (SIN birth_date)
        const { data: s, error: eS } = await supabase
          .from('students')
          .select('id, first_name, last_name, run')
          .eq('id', studentId)
          .single()
        if (eS) throw eS
        setStudent(s as Student)

        // Curso
        const { data: c, error: eC } = await supabase
          .from('courses')
          .select('id, code, name')
          .eq('id', courseId)
          .single()
        if (eC) throw eC
        setCourse(c as Course)

        // Profesor Jefe (opcional, si existe relación)
        let pj: Teacher | null = null
        const { data: courseMeta } = await supabase
          .from('courses')
          .select('teacher_id')
          .eq('id', courseId)
          .single()
        if (courseMeta?.teacher_id) {
          const { data: t } = await supabase
            .from('teachers')
            .select('id, full_name')
            .eq('id', courseMeta.teacher_id)
            .single()
          if (t) pj = { id: t.id, full_name: t.full_name }
        }
        setProfJefe(pj)

        // Asignaturas
        const { data: subs, error: eSub } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('course_id', courseId)
          .order('name', { ascending: true })
        if (eSub) throw eSub
        setSubjects((subs ?? []) as Subject[])
        const subjectIds = (subs ?? []).map((x:any)=>x.id)

        // Evaluaciones del semestre
        let apsCast: Assessment[] = []
        if (subjectIds.length) {
          const { data: aps, error: eAp } = await supabase
            .from('assessment_plans')
            .select('id, subject_id, name, due_date, semester')
            .in('subject_id', subjectIds)
            .eq('semester', semester)
          if (eAp) throw eAp
          apsCast = (aps ?? []).map((a:any)=>({
            id: a.id, subject_id: a.subject_id, name: a.name, due_date: a.due_date, semester: a.semester
          }))
          setAssessments(apsCast)
        } else {
          setAssessments([])
        }

        // Notas del alumno
        if (apsCast.length) {
          const apIds = apsCast.map(a => a.id)
          const { data: gr, error: eG } = await supabase
            .from('grades')
            .select('assessment_id, grade')
            .eq('student_id', studentId)
            .in('assessment_id', apIds)
          if (eG) throw eG
          setGrades((gr ?? []) as Grade[])
        } else {
          setGrades([])
        }

        // Asistencia (por meses del semestre)
        const months = semesterMonths(semester)
        const { data: sessions, error: eSes } = await supabase
          .from('attendance_sessions')
          .select('id, session_date')
          .eq('course_id', courseId)
        if (eSes) throw eSes
        const sesIds = (sessions ?? [])
          .filter((s:any) => s.session_date && months.includes(new Date(s.session_date).getMonth()+1))
          .map((s:any)=>s.id)

        let worked = 0, attended = 0
        if (sesIds.length) {
          worked = sesIds.length
          const { data: marks, error: eMk } = await supabase
            .from('attendance_marks')
            .select('session_id, student_id, present')
            .eq('student_id', studentId)
            .in('session_id', sesIds)
          if (eMk) throw eMk
          attended = (marks ?? []).filter((m:any) => m.present === true).length
        }
        const absent = Math.max(0, worked - attended)
        const pct = worked ? `${(Math.round(((attended/worked)*100)*10)/10).toFixed(1)}%` : '—'
        setAttendance({ worked, attended, absent, pct })

        setLoading(false)
      } catch (err:any) {
        console.error('report-card-official error', err)
        setError(err?.message || String(err))
        setLoading(false)
      }
    }
    run()
  }, [courseId, studentId, semester])

  // Tabla oficial 01..17 + P-2, P-1, PF
  const { rows, maxCols, overallPF } = useMemo(() => {
    const bySubject: Record<number, Assessment[]> = {}
    assessments.forEach(a => {
      bySubject[a.subject_id] = bySubject[a.subject_id] || []
      bySubject[a.subject_id].push(a)
    })
    Object.values(bySubject).forEach(list => list.sort((a,b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : 0
      const db = b.due_date ? new Date(b.due_date).getTime() : 0
      return da - db || a.id - b.id
    }))

    const gmap = new Map<number, number>()
    grades.forEach(g => { if (g.grade != null) gmap.set(g.assessment_id, g.grade!) })

    const maxCols = Math.min(17, subjects.reduce((mx, s) => Math.max(mx, (bySubject[s.id]?.length || 0)), 0))
    const allPF: number[] = []

    const rows = subjects.map(s => {
      const list = bySubject[s.id] || []
      const cols: string[] = []
      const nums: number[] = []

      for (let i=0; i<maxCols; i++) {
        const a = list[i]
        if (a) {
          const val = gmap.get(a.id)
          if (typeof val === 'number') {
            const r = round1(val).toFixed(1)
            cols.push(r)
            nums.push(val)
          } else {
            cols.push('')
          }
        } else {
          cols.push('')
        }
      }

      const avg = nums.length ? round1(nums.reduce((a,b)=>a+b,0)/nums.length) : null
      const p2 = avg != null ? avg.toFixed(1) : ''
      const p1 = avg != null ? avg.toFixed(1) : ''
      const pf = avg != null ? avg.toFixed(1) : ''
      if (avg != null) allPF.push(avg)

      return { subject: s.name, cols, p2, p1, pf }
    })

    const overallPF = allPF.length ? round1(allPF.reduce((a,b)=>a+b,0)/allPF.length).toFixed(1) : '—'
    return { rows, maxCols, overallPF }
  }, [subjects, assessments, grades])

  const downloadPDF = async () => {
    const el = reportRef.current
    if (!el) return
    const canvas = await html2canvas(el, { scale: 2, useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgWidth = pageWidth - 20
    const imgHeight = canvas.height * imgWidth / canvas.width
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight)
    const filename = `informe_oficial_sem${semester}_${student?.last_name || ''}_${student?.first_name || ''}.pdf`
    pdf.save(filename.replace(/\s+/g,'_'))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a href="/dashboard" className="rounded border px-3 py-1">← Volver</a>
        <select
          className="rounded border px-2 py-1"
          value={semester}
          onChange={e=>{
            const sem = Number(e.target.value)
            const p = new URLSearchParams(searchParams.toString())
            p.set('semester', String(sem))
            router.replace(`/report-card-official?${p.toString()}`)
          }}
        >
          <option value={1}>1° semestre</option>
          <option value={2}>2° semestre</option>
        </select>
        <button onClick={downloadPDF} className="rounded bg-black px-3 py-1 text-white">Descargar PDF</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? <p>Cargando…</p> : (
        <div ref={reportRef} className="rounded-4xl border bg-white p-5 shadow">
          {/* Encabezado superior + logo */}
          <div className="flex items-start justify-between">
            <div className="text-center flex-1">
              <img src="/img/logo.png" alt="Logo Colegio" className="mx-auto h-40 w-40 object-contain" />
              <h2 className="text-4xl font-bold mt-1">COLEGIO SAINT THOMAS</h2>
              <p className="mt-1 text-xl">Informe de Notas {semester === 1 ? '1°' : '2°'} Semestre del {new Date().getFullYear()}</p>
              <div className="mt-3 text-base leading-5">
                <div>DECRETO EXENTO DE EVALUACION Y PROMOCIÓN DE ALUMNOS N° 67/2018</div>
                <div>DECRETO EXENTO APRUEBA PLAN Y PROGRAMAS DE ESTUDIOS N° 2960/2012</div>
                <div>RESOLUCIÓN EXENTA DECRETO COOPERADOR DE LA FUNC. EDUCACIONAL DEL ESTADO N°2288/1985</div>
              </div>
            </div>
          </div>

          {/* Ficha del alumno (sin birth_date) */}
          <div className="mt-4 grid grid-cols-1 gap-1 text-base">
            <div className="flex flex-wrap gap-3">
              <span><strong>NOMBRE ALUMNO:</strong> {student ? `${student.first_name} ${student.last_name}` : '—'}</span>
              <span><strong>R.U.N:</strong> {student?.run ?? '—'}</span>
              <span><strong>CURSO:</strong> {course ? `${course.name}` : '—'}</span>
              {/* sin F. Nacimiento */}
            </div>
            <div className="flex flex-wrap gap-3">
              <span><strong>PROFESOR JEFE:</strong> {profJefe?.full_name ?? '—'}</span>
              <span><strong>A.ESCOLAR:</strong> {new Date().getFullYear()}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <span><strong>REGION:</strong> QUINTA</span>
              <span><strong>PROV.:</strong> VALPARAISO</span>
              <span><strong>COMUNA:</strong> VALPARAISO</span>
            </div>
          </div>

          {/* Tabla Notas Parciales + Promedios */}
          <div className="mt-4">
            <div className="overflow-auto">
              <table className="min-w-full border text-base">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border p-1 text-left align-bottom"> </th>
                    <th className="border p-1 text-center align-bottom" colSpan={maxCols}>NOTAS PARCIALES</th>
                    <th className="border p-1 text-center align-bottom" colSpan={3}>Promedios</th>
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="border p-1 text-left">Asignatura</th>
                    {Array.from({length:maxCols}, (_,i)=>(
                      <th key={i} className="border p-1 text-center">{String(i+1).padStart(2,'0')}</th>
                    ))}
                    <th className="border p-1 text-center">P-2</th>
                    <th className="border p-1 text-center">P-1</th>
                    <th className="border p-1 text-center">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx)=>(
                    <tr key={idx}>
                      <td className="border p-1 font-medium">{r.subject}</td>
                      {r.cols.map((v, j)=>(
                        <td key={j} className="border p-1 text-center">{v}</td>
                      ))}
                      <td className="border p-1 text-center">{r.p2}</td>
                      <td className="border p-1 text-center">{r.p1}</td>
                      <td className="border p-1 text-center">{r.pf}</td>
                    </tr>
                  ))}
                  {/* Fila de ORIENTACIÓN (I) */}
                  <tr>
                    <td className="border p-1 font-medium">ORIENTACIÓN</td>
                    {Array.from({length:maxCols}, (_,i)=>(
                      <td key={i} className="border p-1 text-center">I</td>
                    ))}
                    <td className="border p-1 text-center"></td>
                    <td className="border p-1 text-center"></td>
                    <td className="border p-1 text-center"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Apreciación final / Asistencia / Promoción / Observaciones */}
          <div className="mt-4 grid grid-cols-1 gap-3 text-base">
            <div><strong>(APRECIACIÓN FINAL)</strong> {overallPF}</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><strong>TOTAL DE DÍAS TRABAJADOS:</strong> {attendance?.worked ?? '—'}</div>
              <div><strong>TOTAL DE DÍAS INASISTENTES:</strong> {attendance?.absent ?? '—'}</div>
              <div><strong>TOTAL DE DÍAS ASISTIDOS:</strong> {attendance?.attended ?? '—'}</div>
              <div><strong>PORCENTAJE DE ASISTENCIA(%):</strong> {attendance?.pct ?? '—'}</div>
            </div>

            <div><strong>En Consecuencia :</strong>  Es Promovida/o a {/* Ajusta si tienes regla */} {course ? `Octavo Año de Educación General Básica` : '—'}.</div>

            <div>
              <strong>Observaciones:</strong>
              <div className="mt-1 min-h-[48px] rounded border p-2 text-base text-gray-700 bg-white"></div>
            </div>
          </div>

          {/* Firmas */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="h-16 rounded-lg border" />
              <div className="mt-2 text-base">{profJefe?.full_name ?? 'Profesor/a Jefe'}</div>
              <div className="text-base text-gray-600">Profesor/a Jefe</div>
            </div>
            <div className="text-center">
              <div className="h-16 rounded-lg border" />
              <div className="mt-2 text-base">Mei-Ling Moth Rubilar</div>
              <div className="text-base text-gray-600">Director/a</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
