'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import ExcelJS from 'exceljs'

type Student = { id: string; first_name: string; last_name: string }
type Session = { id: number; session_date: string; block: number; course_id: number }
type Mark = { session_id: number; student_id: string; present: boolean | null }
type Holiday = { day: string; name: string | null }

// ---- util fechas ----
function formatYMD(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function getMonthWeekdays(yyyyMM: string) {
  // yyyy-MM => arreglo de fechas (YYYY-MM-DD) solo L-V
  const [yyyy, mm] = yyyyMM.split('-').map(Number)
  const first = new Date(yyyy, mm - 1, 1)
  const last = new Date(yyyy, mm, 0) // día 0 del siguiente mes = último del mes
  const res: string[] = []
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const dow = d.getDay() // 0=Dom, 1=Lun,...6=Sab
    if (dow >= 1 && dow <= 5) res.push(formatYMD(d))
  }
  return res
}

export default function AttendanceMonth() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const courseId = Number(searchParams.get('courseId') || '0')
  const monthParam = String(searchParams.get('month') || '') // YYYY-MM

  const [month, setMonth] = useState<string>(() => {
    if (monthParam) return monthParam
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })

  const [students, setStudents] = useState<Student[]>([])
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session | null>>({})
  const [marksMap, setMarksMap] = useState<Record<string, 'present'|'absent'|''>>({}) // key `${studentId}-${date}`
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => getMonthWeekdays(month), [month])

  // ---- navegación mes ----
  const goMonth = (delta: number) => {
    const [yy, mm] = month.split('-').map(Number)
    const d = new Date(yy, mm - 1 + delta, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const newVal = `${y}-${m}`
    setMonth(newVal)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', newVal)
    if (courseId) params.set('courseId', String(courseId))
    router.replace(`/attendance-month?${params.toString()}`)
  }

  // ---- carga de datos ----
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true); setError(null)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { window.location.href = '/login'; return }
        if (!courseId) { setError('Falta courseId en la URL'); setLoading(false); return }

        // 1) Estudiantes del curso
        const { data: enrolls, error: e1 } = await supabase
          .from('enrollments')
          .select('student_id, students(id, first_name, last_name)')
          .eq('course_id', courseId)
          .order('student_id')
        if (e1) throw e1
        const studs = (enrolls ?? []).map((r:any)=>r.students).filter(Boolean) as Student[]
        setStudents(studs)

        // 2) Feriados del mes
        const start = `${month}-01`
        const end = `${month}-31`
        const { data: holis, error: e2 } = await supabase
          .from('holidays')
          .select('day, name')
          .gte('day', start).lte('day', end)
        if (e2 && e2.code !== 'PGRST116') throw e2
        const holo: Record<string, Holiday> = {}
        ;(holis ?? []).forEach((h:any)=> { holo[h.day] = { day: h.day, name: h.name } })
        setHolidays(holo)

        // 3) Sesiones existentes del curso para el mes (usamos block=1)
        const { data: sessions, error: e3 } = await supabase
          .from('attendance_sessions')
          .select('id, session_date, block, course_id')
          .eq('course_id', courseId)
          .in('session_date', dates)
        if (e3) throw e3
        const sesMap: Record<string, Session | null> = {}
        dates.forEach(d => { sesMap[d] = null })
        ;(sessions ?? []).forEach((s:any) => {
          if (s.block === 1) sesMap[s.session_date] = s as Session
        })
        setSessionsByDate(sesMap)

        // 4) Marcas de asistencia
        const sessionIds = (sessions ?? []).map((s:any)=>s.id)
        let marks: Mark[] = []
        if (sessionIds.length) {
          const { data: m, error: e4 } = await supabase
            .from('attendance_marks')
            .select('session_id, student_id, present')
            .in('session_id', sessionIds)
          if (e4) throw e4
          marks = m as Mark[]
        }
        const map: Record<string, 'present'|'absent'|''> = {}
        marks.forEach(m => {
          const date = (sessions ?? []).find((s:any)=>s.id===m.session_id)?.session_date
          if (!date) return
          map[`${m.student_id}-${date}`] = m.present === true ? 'present' : m.present === false ? 'absent' : ''
        })
        setMarksMap(map)

        setLoading(false)
      } catch (err:any) {
        console.error('attendance-month error', err)
        setError(err?.message || String(err))
        setLoading(false)
      }
    }
    if (courseId) run()
  }, [courseId, month, dates.join(',')])

  // ---- feriado ON/OFF ----
  const toggleHoliday = async (date: string) => {
    try {
      if (holidays[date]) {
        const { error } = await supabase.from('holidays').delete().eq('day', date)
        if (error) throw error
        const copy = { ...holidays }
        delete copy[date]
        setHolidays(copy)
      } else {
        const name = prompt('Nombre del feriado (opcional):') || null
        const { error } = await supabase.from('holidays').upsert({ day: date, name })
        if (error) throw error
        setHolidays(prev => ({ ...prev, [date]: { day: date, name } }))
      }
    } catch (e:any) {
      alert(e.message || String(e))
    }
  }

  // ---- marcar asistencia (vacío → ✓ → ✗ → vacío) con UPSERT de sesión y marca ----
  const toggleMark = async (studentId: string, date: string) => {
    if (holidays[date]) return // no marcar en feriado
    try {
      // 1) asegurar sesión (block=1) con UPSERT para evitar duplicados
      let session = sessionsByDate[date]
      if (!session) {
        const { data, error } = await supabase
          .from('attendance_sessions')
          .upsert(
            { course_id: courseId, session_date: date, block: 1 },
            { onConflict: 'course_id,session_date,block' }
          )
          .select('id, session_date, block, course_id')
          .single()

        if (error && (error as any).code === '23505') {
          // Conflicto: leer existente (condición de carrera)
          const { data: existing, error: e2 } = await supabase
            .from('attendance_sessions')
            .select('id, session_date, block, course_id')
            .eq('course_id', courseId)
            .eq('session_date', date)
            .eq('block', 1)
            .single()
          if (e2) throw e2
          session = existing as any
        } else if (error) {
          throw error
        } else {
          session = data as any
        }

        setSessionsByDate(prev => ({ ...prev, [date]: session! }))
      }

      // 2) estado actual y siguiente ('' -> present -> absent -> '')
      const key = `${studentId}-${date}`
      const cur = marksMap[key] || ''
      const next: 'present'|'absent'|'' = cur === '' ? 'present' : cur === 'present' ? 'absent' : ''

      // 3) guardar marca (upsert por (session_id, student_id)) **incluyendo `status`**
      if (next === '') {
        const { error } = await supabase
          .from('attendance_marks')
          .delete()
          .match({ session_id: session!.id, student_id: studentId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('attendance_marks')
          .upsert(
            {
              session_id: session!.id,
              student_id: studentId,
              present: next === 'present',
              status: next === 'present' ? 'present' : 'absent',
            },
            { onConflict: 'session_id,student_id' }
          )
        if (error) throw error
      }

      setMarksMap(prev => ({ ...prev, [key]: next }))
    } catch (e:any) {
      alert(e.message || String(e))
    }
  }

  // ---- exportar a Excel ----
  const downloadExcel = async () => {
    const headers = ['Estudiante', ...dates] // columnas por día (YYYY-MM-DD)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`Asistencia ${month}`)

    // encabezados
    ws.addRow(headers)
    ws.getRow(1).font = { bold: true }

    // filas: un estudiante por fila
    students.forEach(st => {
      const fullName = `${st.last_name}, ${st.first_name}`
      const cols = dates.map(d => {
        const key = `${st.id}-${d}`
        if (holidays[d]) return 'Feriado'
        const val = marksMap[key] || ''
        return val === 'present' ? '✓' : val === 'absent' ? '✗' : ''
      })
      ws.addRow([fullName, ...cols])
    })

    // estilos simples
    for (let i = 1; i <= headers.length; i++) ws.getColumn(i).width = i === 1 ? 28 : 12

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencia_${courseId}_${month}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <a href="/dashboard" className="rounded border px-3 py-1">← Volver</a>
      <div className="flex items-center gap-2">
        <button onClick={()=>goMonth(-1)} className="rounded border px-2 py-1">◀ Mes anterior</button>
        <strong>{month}</strong>
        <button onClick={()=>goMonth(1)} className="rounded border px-2 py-1">Mes siguiente ▶</button>
      </div>
      <button onClick={downloadExcel} className="rounded bg-black px-3 py-1 text-white">
        Descargar Excel
      </button>
      <span className="text-sm text-gray-600">
        Click en celda: vacío → ✓ → ✗ → vacío. Click en el título del día para marcar/descartar <b>feriado</b>.
      </span>
    </div>
  )

  return (
    <div>
      {header}
      {error && <p className="mb-2 text-sm text-red-600">Error: {error}</p>}
      {loading ? <p>Cargando…</p> : (
        <div className="overflow-auto rounded-2xl border bg-white p-3 shadow">
          {students.length === 0 ? (
            <p>No hay estudiantes matriculados en este curso.</p>
          ) : (
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="text-left">
                  <th className="w-64 p-2">Estudiante</th>
                  {dates.map(d => {
                    const isHoliday = !!holidays[d]
                    return (
                      <th
                        key={d}
                        className={`p-2 cursor-pointer ${isHoliday ? 'bg-yellow-100' : ''}`}
                        onClick={()=>toggleHoliday(d)}
                        title={isHoliday ? (holidays[d]?.name || 'Feriado') : 'Click para marcar feriado'}
                      >
                        {d}{isHoliday ? ' 🏖️' : ''}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map(st => (
                  <tr key={st.id} className="border-t">
                    <td className="p-2">{st.last_name}, {st.first_name}</td>
                    {dates.map(d => {
                      const key = `${st.id}-${d}`
                      const val = marksMap[key] || ''
                      const isHoliday = !!holidays[d]
                      const symbol = isHoliday ? 'Feriado' : val === 'present' ? '✓' : val === 'absent' ? '✗' : ''
                      return (
                        <td
                          key={d}
                          className={`p-2 text-center ${isHoliday ? 'bg-yellow-50 text-gray-500' : 'cursor-pointer'}`}
                          onClick={()=>!isHoliday && toggleMark(st.id, d)}
                        >
                          {symbol}
                        </td>
                      )
                    })}
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
