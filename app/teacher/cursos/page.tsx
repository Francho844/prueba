'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, BookOpen, ExternalLink } from 'lucide-react'

type Row = {
  teacher_id: string
  course_subject_id: number
  course_id: number
  course_code: string
  course_name: string
  school_year: number
  subject_id: number
  subject_code: string | null
  subject_name: string
}

function Button({ children, className = '', ...props }: any) {
  return (
    <button
      className={
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
        'bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60 ' +
        className
      }
      {...props}
    >
      {children}
    </button>
  )
}

export default function TeacherCursosPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [yearFilter, setYearFilter] = useState<number | ''>('')

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/teacher/my-assignments', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo cargar')
      setRows(json.items || [])
    } catch (e: any) {
      setError(e?.message || 'Error cargando cursos')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const r of rows) if (Number.isFinite(r.school_year)) set.add(Number(r.school_year))
    return Array.from(set).sort((a,b) => b - a)
  }, [rows])

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>() // key = `${year} · ${course_name} (${course_code})`
    for (const r of rows.filter(r => (yearFilter === '' ? true : r.school_year === yearFilter))) {
      const key = `${r.school_year} · ${r.course_name} (${r.course_code})`
      const arr = map.get(key) || []
      arr.push(r)
      map.set(key, arr)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a,b) => a.subject_name.localeCompare(b.subject_name, 'es'))
      map.set(k, arr)
    }
    return Array.from(map.entries()).sort((a,b) => {
      const ay = Number(a[0].split(' · ')[0]); const by = Number(b[0].split(' · ')[0])
      if (!Number.isNaN(ay) && !Number.isNaN(by) && ay !== by) return by - ay
      return a[0].localeCompare(b[0], 'es')
    })
  }, [rows, yearFilter])

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis cursos y asignaturas</h1>
          <p className="text-sm text-slate-600">Selecciona una asignatura para ir a la vista de evaluaciones/notas.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = '/teacher')} className="bg-gray-600 hover:bg-gray-700">
            ← Panel docente
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm font-medium">Año:</label>
          <select
            className="rounded border px-3 py-2"
            value={yearFilter === '' ? '' : yearFilter}
            onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todos</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {loading && <span className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </span>}
          {error && <span className="text-sm text-rose-700">Error: {error}</span>}
        </div>

        {(!loading && rows.length === 0) ? (
          <div className="rounded border border-dashed p-8 text-center text-slate-600">
            No tienes cursos asignados.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([groupLabel, arr]) => (
              <div key={groupLabel} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-slate-600" />
                  <div className="font-semibold">{groupLabel}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {arr.map(r => (
                    <a
                      key={`${r.course_id}-${r.subject_id}`}
                      href={`/teacher/cursos/${r.course_id}/asignaturas/${r.subject_id}`}
                      className="group rounded-lg border p-3 hover:bg-slate-50 transition"
                    >
                      <div className="text-sm text-slate-500">{r.subject_code || '—'}</div>
                      <div className="font-medium">{r.subject_name}</div>
                      <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                        Abrir <ExternalLink className="h-3 w-3 opacity-70 group-hover:opacity-100" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
