'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2, RefreshCcw, ArrowLeft, Download,
  ChevronLeft, ChevronRight, MoreVertical,
  FileText, ClipboardList, NotebookText
} from 'lucide-react'

type StudentRow = {
  student_id: string
  list_number: number | null
  students: { first_name: string | null; last_name: string | null; run?: string | null }
}

type SubjectRow = {
  id: number
  subject_id: number
  subjects: { name: string; code: string | null }
}

type HomeroomResponse = {
  ok: boolean
  homeroom: {
    course: { id: number; code: string; name: string; school_year_id: number }
    students: StudentRow[]
    subjects: SubjectRow[]
  } | null
  error?: string
}

function fullName(f: string | null, l: string | null) {
  return `${(l ?? '').trim()} ${(f ?? '').trim()}`.trim()
}

// --- Dropdown simple y accesible para acciones por alumno ---
function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler, { passive: true })
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

type RowMenuProps = {
  studentId: string
  onClose: () => void
  goFicha: (id: string) => void
  goAsistencia: (id: string) => void
  goNotas: (id: string) => void
}
function RowMenu({ studentId, onClose, goFicha, goAsistencia, goNotas }: RowMenuProps) {
  const ref = useClickOutside<HTMLDivElement>(onClose)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-44 rounded-lg border bg-white shadow-lg z-[100]"
      role="menu"
      aria-label="Acciones de alumno"
    >
      <button
        onClick={() => { onClose(); goFicha(studentId) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
        role="menuitem"
      >
        <FileText className="h-4 w-4" /> Ficha del estudiante
      </button>
      <button
        onClick={() => { onClose(); goAsistencia(studentId) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
        role="menuitem"
      >
        <ClipboardList className="h-4 w-4" /> Asistencia
      </button>
      <button
        onClick={() => { onClose(); goNotas(studentId) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
        role="menuitem"
      >
        <NotebookText className="h-4 w-4" /> Notas
      </button>
    </div>
  )
}

export default function JefaturaPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [course, setCourse] = useState<{ id: number; code: string; name: string; school_year_id: number } | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [filter, setFilter] = useState('')

  // Panel izquierdo fijo: N°, Alumno, Acciones (menú)
  const firstColWidthPx = 56    // N°
  const secondColWidthPx = 256  // Alumno
  const actionsColWidthPx = 60  // Botón kebab (compacto)
  const leftPaneWidth = firstColWidthPx + secondColWidthPx + actionsColWidthPx // 372

  // Scroll vertical compartido
  const verticalScrollRef = useRef<HTMLDivElement | null>(null)

  // Scroll horizontal del panel derecho
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollMax, setScrollMax] = useState(0)

  function syncHorizontalState() {
    const el = rightPaneRef.current
    if (!el) return
    setScrollLeft(el.scrollLeft)
    setScrollMax(Math.max(0, el.scrollWidth - el.clientWidth))
  }
  function handleRangeChange(v: number) {
    const el = rightPaneRef.current
    if (!el) return
    el.scrollTo({ left: v, behavior: 'smooth' })
  }
  function nudge(delta: number) {
    const el = rightPaneRef.current
    if (!el) return
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }
  useEffect(() => {
    const el = rightPaneRef.current
    if (!el) return
    const onScroll = () => syncHorizontalState()
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])

  // Menú por fila (guardamos el id abierto)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  async function loadHomeroom() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/teacher/homeroom', { cache: 'no-store' })
      const json: HomeroomResponse = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)

      if (!json.homeroom) {
        setCourse(null); setStudents([]); setSubjects([])
        setError('No eres profesor jefe de ningún curso vigente.')
        return
      }

      setCourse(json.homeroom.course)

      const roster = (json.homeroom.students || []).slice().sort((a, b) => {
        const an = a.list_number, bn = b.list_number
        if (an != null && bn != null && an !== bn) return an - bn
        if (an != null && bn == null) return -1
        if (an == null && bn != null) return 1
        return fullName(a.students.first_name, a.students.last_name).localeCompare(
          fullName(b.students.first_name, b.students.last_name), 'es'
        )
      })
      setStudents(roster)
      setSubjects(json.homeroom.subjects || [])
    } catch (e: any) {
      setError(e?.message || 'Error cargando')
      setCourse(null); setStudents([]); setSubjects([])
    } finally {
      setLoading(false)
      setTimeout(syncHorizontalState, 0)
    }
  }

  useEffect(() => { loadHomeroom() }, [])

  const filteredStudents = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return students
    return students.filter(s => {
      const name = fullName(s.students.first_name, s.students.last_name).toLowerCase()
      const run = (s.students.run || '').toLowerCase()
      const num = s.list_number != null ? String(s.list_number) : ''
      return name.includes(f) || run.includes(f) || num === f
    })
  }, [students, filter])

  function exportCSV() {
    if (!course) return
    const headers = ['N°', 'Alumno', 'Acciones', ...subjects.map(s => s.subjects.code || s.subjects.name), 'Prom. General']
    const rows = filteredStudents.map(st => {
      const alumno = fullName(st.students.first_name, st.students.last_name)
      const colsMaterias = subjects.map(() => '—') // sin notas aún
      return [st.list_number ?? '', alumno, '', ...colsMaterias, '—']
    })
    const csv = [headers, ...rows].map(r =>
      r.map(val => {
        const v = String(val ?? '')
        return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
      }).join(';')
    ).join('\n')

    const name = `jefatura_${course.code.replace(/\s+/g, '_')}.csv`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Navegación (ajusta rutas a tu app)
  function goFicha(studentId: string) {
  window.location.href = `/teacher/estudiantes/${studentId}`
  }
  function goAsistencia(studentId: string) {
    if (!course) return
    window.location.href = `/teacher/cursos/${course.id}/alumnos/${studentId}/asistencia`
  }
  function goNotas(studentId: string) {
    if (!course) return
    window.location.href = `/teacher/cursos/${course.id}/alumnos/${studentId}/notas`
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mi curso (Profesor Jefe)</h1>
          <p className="text-sm text-slate-600">
            {course ? `${course.name} (${course.code}) · Año ${course.school_year_id}` : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (window.location.href = '/teacher')}
            className="rounded-md border px-3 py-2 hover:bg-gray-50"
            aria-label="Volver al panel docente"
            title="Volver al panel docente"
          >
            <ArrowLeft className="h-4 w-4 inline -mt-0.5 mr-1" /> Volver
          </button>
          <button
            onClick={loadHomeroom}
            className="rounded-md border px-3 py-2 hover:bg-gray-50"
            aria-label="Recargar curso y lista"
            title="Recargar curso y lista"
          >
            <RefreshCcw className="h-4 w-4 inline -mt-0.5 mr-1" /> Recargar
          </button>
          <button
            onClick={exportCSV}
            disabled={!course || filteredStudents.length === 0}
            className="rounded-md border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Exportar CSV"
            title="Exportar CSV"
          >
            <Download className="h-4 w-4 inline -mt-0.5 mr-1" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-end gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-sm mb-1">Buscar alumno</label>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="N° lista, apellido, nombre o RUN"
              aria-label="Buscar alumno por número, nombre o RUN"
            />
          </div>
          {loading && (
            <span className="inline-flex items-center gap-1 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </span>
          )}
          {error && !loading && (
            <span className="text-sm text-rose-700" role="alert">Error: {error}</span>
          )}
        </div>

        {/* Controles de scroll horizontal del panel derecho */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => nudge(-400)}
            className="rounded-md border px-2 py-1 hover:bg-gray-50"
            title="Desplazar tabla a la izquierda"
            aria-label="Desplazar tabla a la izquierda"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={0}
            max={scrollMax || 0}
            value={Math.min(scrollLeft, scrollMax)}
            onChange={(e) => handleRangeChange(Number(e.target.value))}
            className="flex-1"
            aria-label="Control de desplazamiento horizontal de la tabla"
          />
          <button
            onClick={() => nudge(+400)}
            className="rounded-md border px-2 py-1 hover:bg-gray-50"
            title="Desplazar tabla a la derecha"
            aria-label="Desplazar tabla a la derecha"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Contenedor con scroll vertical compartido */}
        <div
          ref={verticalScrollRef}
          className="relative overflow-auto rounded-2xl border bg-white"
          style={{ maxHeight: 520 }}
        >
          <div className="flex min-w-full">
            {/* PANEL IZQUIERDO (fijo: N°, Alumno, Menú) */}
            <div
              className="sticky left-0 top-0 bg-white border-r"
              style={{ width: leftPaneWidth, zIndex: 50, flex: '0 0 auto' }}
            >
              <table className="text-sm table-fixed" style={{ borderCollapse: 'separate', borderSpacing: 0, width: leftPaneWidth }}>
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th
                      className="text-left py-2 px-2"
                      style={{ width: firstColWidthPx, minWidth: firstColWidthPx, borderRight: '1px solid #e5e7eb' }}
                    >
                      N°
                    </th>
                    <th
                      className="text-left py-2 px-2"
                      style={{ width: secondColWidthPx, minWidth: secondColWidthPx, borderRight: '1px solid #e5e7eb' }}
                    >
                      Alumno
                    </th>
                    <th
                      className="text-left py-2 px-2"
                      style={{ width: actionsColWidthPx, minWidth: actionsColWidthPx }}
                    >
                      {/* vacío: solo ícono en filas */}
                      Acc.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 && !loading ? (
                    <tr>
                      <td className="py-6 px-2 text-slate-500" colSpan={3}>
                        {students.length === 0
                          ? (course ? 'Este curso no tiene estudiantes cargados.' : 'Sin datos de curso.')
                          : 'No hay alumnos que coincidan con tu búsqueda.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(st => (
                      <tr key={st.student_id} className="border-b last:border-0">
                        <td
                          className="py-2 px-2 text-center whitespace-nowrap bg-white"
                          style={{ width: firstColWidthPx, minWidth: firstColWidthPx, borderRight: '1px solid #e5e7eb' }}
                        >
                          {st.list_number ?? ''}
                        </td>
                        <td
                          className="py-2 px-2 whitespace-nowrap bg-white"
                          style={{ width: secondColWidthPx, minWidth: secondColWidthPx, borderRight: '1px solid #e5e7eb' }}
                          title={fullName(st.students.first_name, st.students.last_name)}
                        >
                          {fullName(st.students.first_name, st.students.last_name)}
                        </td>
                        <td
                          className="py-1 px-2 bg-white relative"
                          style={{ width: actionsColWidthPx, minWidth: actionsColWidthPx }}
                        >
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenMenuId(prev => prev === st.student_id ? null : st.student_id)}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === st.student_id}
                              aria-label="Abrir menú de acciones"
                              className="inline-flex items-center justify-center rounded border px-2 py-1 hover:bg-gray-50"
                              title="Acciones"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenuId === st.student_id && (
                              <RowMenu
                                studentId={st.student_id}
                                onClose={() => setOpenMenuId(null)}
                                goFicha={goFicha}
                                goAsistencia={goAsistencia}
                                goNotas={goNotas}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PANEL DERECHO (scroll horizontal: Asignaturas + Prom. General) */}
            <div ref={rightPaneRef} className="overflow-auto" style={{ flex: '1 1 auto' }}>
              <table className="min-w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr className="border-b bg-slate-50">
                    {subjects.map(s => (
                      <th
                        key={s.subject_id}
                        className="text-left py-2 px-2 whitespace-nowrap"
                        title={s.subjects.name}
                      >
                        <div className="font-medium leading-tight">{s.subjects.name}</div>
                        {s.subjects.code && <div className="text-xs text-slate-500 leading-tight">({s.subjects.code})</div>}
                      </th>
                    ))}
                    <th className="text-left py-2 px-2 whitespace-nowrap">Prom. General</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 && !loading ? (
                    <tr>
                      <td className="py-6 px-2 text-slate-500" colSpan={Math.max(1, subjects.length + 1)}>
                        —
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(st => (
                      <tr key={st.student_id} className="border-b last:border-0">
                        {subjects.map(s => (
                          <td key={`${st.student_id}:${s.subject_id}`} className="py-2 px-2 whitespace-nowrap">—</td>
                        ))}
                        <td className="py-2 px-2 font-semibold whitespace-nowrap">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
