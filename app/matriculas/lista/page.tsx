'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

type Row = {
  id: number
  admission_number: string | null
  admission_date: string | null
  school_year: number | null
  course_id: number | null
  first_name: string | null
  last_name: string | null
  course_name: string | null
}

export default function ListaMatriculasPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr(null)
      const { data, error } = await supabase
        .from('v_enrollment_forms')
        .select('id, admission_number, admission_date, school_year, course_id, first_name, last_name, course_name')
        .eq('school_year', year)
        .order('admission_number', { ascending: true })

      if (error) {
        console.error(error)
        setErr(error.message)
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    })()
  }, [year])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Matrículas {year}</h1>

      <div className="mb-4 flex items-center gap-3">
        <label className="font-medium">Año escolar:</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-28 rounded border px-2 py-1"
        />
        {err && <span className="text-sm text-rose-700">Error: {err}</span>}
      </div>

      {loading ? (
        <p>Cargando matrículas...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-600">No hay matrículas para este año.</p>
      ) : (
        <table className="min-w-full border border-gray-300 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Nº Admisión</th>
              <th className="border px-3 py-2 text-left">Fecha</th>
              <th className="border px-3 py-2 text-left">Alumno</th>
              <th className="border px-3 py-2 text-left">Curso</th>
              <th className="border px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2">{m.admission_number || '—'}</td>
                <td className="border px-3 py-2">{m.admission_date || '—'}</td>
                <td className="border px-3 py-2">
                  {m.first_name} {m.last_name}
                </td>
                <td className="border px-3 py-2">{m.course_name}</td>
                <td className="border px-3 py-2 text-center">
                  <Link
                    href={`/matriculas/ficha/${m.id}`}
                    className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                  >
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
