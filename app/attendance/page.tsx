'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Student = { id: string; first_name: string; last_name: string }

export default function AttendancePage() {
  const url = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost')
  const courseId = Number(url.searchParams.get('courseId') || '0')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [block, setBlock] = useState<string>('1')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true); setError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }

      // Estudiantes del curso
      const { data: enrolls, error: e1 } = await supabase
        .from('enrollments')
        .select('student_id, students(id, first_name, last_name)')
        .eq('course_id', courseId)
      if (e1) { setError(e1.message); setLoading(false); return }
      const studs = (enrolls ?? []).map((row: any) => row.students).filter(Boolean) as Student[]
      setStudents(studs)

     // 2) Obtener o crear sesión de asistencia (IDEMPOTENTE)
const { data: upserted, error: e3 } = await supabase
  .from('attendance_sessions')
  .upsert(
    { course_id: courseId, session_date: date, block },
    { onConflict: 'course_id,session_date,block' } // <- usa tu restricción única
  )
  .select('id')
  .single()

if (e3) { setError(e3.message); setLoading(false); return }
const sid = upserted!.id
setSessionId(sid)

      // Cargar marcas existentes
      const { data: mks, error: e4 } = await supabase
        .from('attendance_marks')
        .select('student_id, status')
        .eq('session_id', sid)
      if (e4) { setError(e4.message); setLoading(false); return }

      const mkMap: Record<string,string> = {}
      ;(mks ?? []).forEach((m:any) => { mkMap[m.student_id] = m.status })
      setMarks(mkMap)
      setLoading(false)
    }
    if (courseId) run()
  }, [courseId, date, block])

  const toggle = async (studentId: string) => {
    if (!sessionId) return
    const next = marks[studentId] === 'presente' ? 'ausente' : 'presente'
    setMarks(prev => ({ ...prev, [studentId]: next }))
    setSaving(true)
    const { error } = await supabase.from('attendance_marks').upsert({
      session_id: sessionId, student_id: studentId, status: next
    }, { onConflict: 'session_id,student_id' })
    if (error) setError(error.message)
    setSaving(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <a href="/dashboard" className="rounded border px-3 py-1">← Volver</a>
        <div>
          <label className="block text-sm">Fecha</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm">Bloque</label>
          <select value={block} onChange={e=>setBlock(e.target.value)} className="rounded border px-2 py-1">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
        {saving && <span className="text-sm">Guardando…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {loading ? <p>Cargando…</p> : (
        <div className="rounded-2xl border bg-white p-4 shadow">
          <h2 className="mb-3 text-lg font-semibold">Asistencia — Curso #{courseId} — {date} (bloque {block})</h2>
          {students.length === 0 ? <p>Este curso no tiene estudiantes matriculados.</p> : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left">
                  <th className="w-1/2 p-2">Estudiante</th>
                  <th className="w-1/2 p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{s.last_name}, {s.first_name}</td>
                    <td className="p-2">
                      <button onClick={()=>toggle(s.id)} className="rounded border px-3 py-1">
                        {marks[s.id] ?? '—'} (clic para alternar)
                      </button>
                    </td>
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
