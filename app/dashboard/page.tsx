'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Course = { id: number; code: string; name: string }

export default function Dashboard() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }
      const { data, error } = await supabase.from('courses').select('id, code, name').limit(50)
      if (!error && data) setCourses(data as Course[])
      setLoading(false)
    }
    run()
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Panel</h1>
        <button onClick={async (e) => { e.preventDefault(); await supabase.auth.signOut(); window.location.href='/login' }} className="rounded border px-3 py-1">
          Salir
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow">
        <h2 className="mb-2 font-medium">Cursos</h2>
        {loading ? <p>Cargando…</p> : (
          <ul className="space-y-2">
            {courses.map(c => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <span className="flex-1">{c.code} — {c.name}</span>
                <a href={`/attendance?courseId=${c.id}`} className="rounded bg-black px-3 py-1 text-white">Asistencia</a>
                <a href={`/attendance-month?courseId=${c.id}`} className="rounded border px-3 py-1">Asistencia mensual</a>
                <a href={`/grades?courseId=${c.id}`} className="rounded border px-3 py-1">Notas</a>
                <a href={`/averages?courseId=${c.id}`} className="rounded border px-3 py-1">Promedios</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
