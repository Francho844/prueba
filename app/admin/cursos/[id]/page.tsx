'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { Loader2, Users, Palette, ArrowLeft, Download } from 'lucide-react'

type RosterRow = {
  course_id: number
  course_name: string
  course_code: string | null
  school_year: number
  student_id: string
  run: string | null
  last_name: string
  first_name: string
  admission_number: string | null
  admission_date: string | null
  elective_subject_id: number | null
  elective_name: string | null
  elective_code: string | null
}

type CourseInfo = {
  id: number
  name: string
  code: string | null
  school_year: number
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-sm font-medium rounded-t ' +
        (active
          ? 'bg-white border-x border-t'
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700')
      }
    >
      {children}
    </button>
  )
}

export default function CursoDetailPage({ params }: { params: { id: string } }) {
  const courseId = Number(params.id)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [roster, setRoster] = useState<RosterRow[]>([])

  const [tab, setTab] = useState<'alumnos' | 'electivos'>('alumnos')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // 1) Intentar obtener roster (y con eso sacar datos del curso)
        const { data: ros, error: eRos } = await supabase
          .from('v_course_roster')
          .select('*')
          .eq('course_id', courseId)
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })

        if (eRos) throw eRos
        setRoster((ros || []) as RosterRow[])

        if (ros && ros.length > 0) {
          const r0 = ros[0] as RosterRow
          setCourse({
            id: r0.course_id,
            name: r0.course_name,
            code: r0.course_code,
            school_year: r0.school_year,
          })
        } else {
          // 2) Si no hay matrículas aún, traer info base del curso + año
          const { data: c } = await supabase
            .from('courses')
            .select('id, name, code, school_year_id')
            .eq('id', courseId)
            .maybeSingle()

          if (c) {
            const { data: sy } = await supabase
              .from('school_years')
              .select('id, year')
              .eq('id', c.school_year_id)
              .maybeSingle()

            setCourse({
              id: c.id,
              name: c.name,
              code: c.code,
              school_year: sy?.year ?? new Date().getFullYear(),
            })
          } else {
            setCourse(null)
          }
        }
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId])

  // ===== Derivados para Electivos
  const byElective = useMemo(() => {
    const groups: Record<
      string,
      { elective_name: string; elective_code: string | null; students: RosterRow[] }
    > = {}

    for (const r of roster) {
      const key =
        r.elective_subject_id && r.elective_name
          ? `${r.elective_subject_id}`
          : '__SIN__'

      if (!groups[key]) {
        groups[key] = {
          elective_name: r.elective_name || '— Sin electivo —',
          elective_code: r.elective_code || null,
          students: [],
        }
      }
      groups[key].students.push(r)
    }

    // Ordenar grupos dejando SIN primero al final
    return Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === '__SIN__' && b !== '__SIN__') return 1
        if (b === '__SIN__' && a !== '__SIN__') return -1
        return 0
      })
      .map(([key, value]) => ({ key, ...value }))
  }, [roster])

  // ===== Export simple a CSV (roster del curso)
  function exportRosterCsv() {
    const headers = [
      'RUN',
      'Apellidos',
      'Nombres',
      'N° Admisión',
      'Fecha Admisión',
      'Electivo',
      'Código Electivo',
    ]
    const rows = roster.map((r) => [
      r.run || '',
      r.last_name,
      r.first_name,
      r.admission_number || '',
      r.admission_date || '',
      r.elective_name || '',
      r.elective_code || '',
    ])

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? '')
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(';')
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName =
      (course ? `${course.name}-${course.school_year}` : `curso-${courseId}`) +
      '-roster.csv'
    a.download = safeName
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 text-slate-600 inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-6">
        <button
          onClick={() => (window.location.href = '/admin/cursos')}
          className="mb-4 inline-flex items-center gap-2 rounded bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a cursos
        </button>
        <div className="rounded border p-6 text-rose-700 bg-white">
          No se encontró el curso.
          {error ? <div className="mt-2 text-sm">Error: {error}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Encabezado */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src="/img/logo.png" alt="Logo" className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold">Curso</h1>
            <p className="text-sm text-slate-600">
              {course.name} {course.code ? `(${course.code})` : ''} — {course.school_year}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (window.location.href = '/admin/cursos')}
            className="rounded bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            <ArrowLeft className="h-4 w-4 inline mr-1" />
            Volver a cursos
          </button>
          <button
            onClick={exportRosterCsv}
            className="inline-flex items-center gap-2 rounded bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
            title="Exportar nómina del curso a CSV"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          <TabButton active={tab === 'alumnos'} onClick={() => setTab('alumnos')}>
            <Users className="h-4 w-4 inline mr-1" />
            Alumnos
          </TabButton>
          <TabButton active={tab === 'electivos'} onClick={() => setTab('electivos')}>
            <Palette className="h-4 w-4 inline mr-1" />
            Electivos
          </TabButton>
        </div>
      </div>

      {/* Contenido pestañas */}
      <div className="rounded-b border bg-white p-4">
        {tab === 'alumnos' && (
          <>
            {roster.length === 0 ? (
              <div className="rounded border border-dashed p-8 text-center text-slate-600">
                Aún no hay alumnos matriculados en este curso.
              </div>
            ) : (
              <table className="min-w-full border border-gray-300 bg-white">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">RUN</th>
                    <th className="border px-3 py-2 text-left">Apellidos</th>
                    <th className="border px-3 py-2 text-left">Nombres</th>
                    <th className="border px-3 py-2 text-left">N° admisión</th>
                    <th className="border px-3 py-2 text-left">Fecha admisión</th>
                    <th className="border px-3 py-2 text-left">Electivo</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.student_id} className="hover:bg-gray-50">
                      <td className="border px-3 py-2">{r.run || '—'}</td>
                      <td className="border px-3 py-2">{r.last_name}</td>
                      <td className="border px-3 py-2">{r.first_name}</td>
                      <td className="border px-3 py-2">{r.admission_number || '—'}</td>
                      <td className="border px-3 py-2">{r.admission_date || '—'}</td>
                      <td className="border px-3 py-2">
                        {r.elective_name ? (
                          <>
                            {r.elective_name}
                            {r.elective_code ? ` (${r.elective_code})` : ''}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'electivos' && (
          <>
            {roster.length === 0 ? (
              <div className="rounded border border-dashed p-8 text-center text-slate-600">
                No hay asignaciones de electivos todavía.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {byElective.map((g) => (
                  <div key={g.key} className="rounded border bg-white">
                    <div className="border-b px-4 py-2 bg-gray-50">
                      <div className="text-sm font-semibold">
                        {g.elective_name}
                        {g.elective_code ? ` — ${g.elective_code}` : ''}
                      </div>
                      <div className="text-xs text-slate-500">{g.students.length} alumno(s)</div>
                    </div>
                    <ul className="p-3 text-sm">
                      {g.students.map((s) => (
                        <li key={s.student_id} className="py-1 border-b last:border-0">
                          {s.last_name}, {s.first_name}
                          {s.run ? ` — ${s.run}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
