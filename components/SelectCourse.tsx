// components/SelectCourse.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

type Course = { id: number; code: string | null; name: string }

export default function SelectCourse({
  onSelect,
  autoRedirect = true,
  targetPath = '/matriculas/ficha',
}: {
  onSelect?: (courseId: number) => void
  autoRedirect?: boolean
  targetPath?: string
}) {
  const router = useRouter()
  const search = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [schoolYear, setSchoolYear] = useState<number | null>(null)
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        // 1) Año escolar activo (si no hay, usa el actual)
        const { data: sy } = await supabase
          .from('school_years')
          .select('year, active')
          .order('year', { ascending: false })
        const active = sy?.find((s) => s.active) ?? sy?.[0]
        setSchoolYear(active?.year ?? new Date().getFullYear())

        // 2) Cursos
        const { data: cs, error } = await supabase
          .from('courses')
          .select('id, code, name')
          .order('name', { ascending: true })
        if (error) throw error
        setCourses(cs ?? [])
      } catch (e: any) {
        setErr(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const options = useMemo(
    () =>
      courses.map((c) => ({
        value: String(c.id),
        label: [c.code, c.name].filter(Boolean).join(' — '),
      })),
    [courses],
  )

  const submit = () => {
    if (!selected) return
    const courseId = Number(selected)
    onSelect?.(courseId)
    if (autoRedirect) {
      const params = new URLSearchParams(search.toString())
      params.set('courseId', String(courseId))
      if (schoolYear) params.set('schoolYear', String(schoolYear))
      router.replace(`${targetPath}?${params.toString()}`)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 text-gray-600">
        Cargando cursos…
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-xl border bg-rose-50 p-4 text-rose-700">
        Error cargando cursos: {err}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="mb-2 text-lg font-semibold">Seleccionar curso</h3>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          className="w-full rounded border px-3 py-2"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— Elige un curso —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
          disabled={!selected}
        >
          Continuar
        </button>
      </div>
      {schoolYear && (
        <p className="mt-2 text-xs text-gray-600">
          Año escolar activo: <b>{schoolYear}</b>
        </p>
      )}
    </div>
  )
}
