'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCcw, UserPlus, XCircle } from 'lucide-react'

type Homeroom = {
  course_id: number
  teacher_id: string
  since: string | null
  until: string | null
  course?: { id: number; code: string; name: string }
  teacher?: { id: string; first_name?: string; last_name?: string; email: string }
}

export default function AdminHomeroomsPage() {
  const [items, setItems] = useState<Homeroom[]>([])
  const [courses, setCourses] = useState<{ id: number; code: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<{ id: string; first_name: string; last_name: string; email: string }[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [courseId, setCourseId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [since, setSince] = useState('')

  async function loadData() {
    setLoading(true); setError(null); setOkMsg(null)
    try {
      const [hRes, cRes, tRes] = await Promise.all([
        fetch('/api/admin/homerooms').then(r => r.json()),
        fetch('/api/courses').then(r => r.json()),
        fetch('/api/teachers').then(r => r.json())
      ])
      if (!hRes.ok) throw new Error(hRes.error)
      setItems(hRes.items || [])
      setCourses(cRes.items || [])
      setTeachers(tRes.items || [])
    } catch (e: any) {
      setError(e.message || 'Error cargando')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function assignPJ() {
    setError(null); setOkMsg(null)
    try {
      const res = await fetch('/api/admin/homerooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          course_id: Number(courseId),
          teacher_id: teacherId,
          since: since || undefined
        })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOkMsg('Profesor jefe asignado correctamente')
      setCourseId(''); setTeacherId(''); setSince('')
      await loadData()
    } catch (e: any) {
      setError(e.message || 'Error asignando PJ')
    }
  }

  async function closePJ(cid: number) {
    if (!confirm('¿Seguro que deseas cerrar la jefatura vigente de este curso?')) return
    try {
      const res = await fetch('/api/admin/homerooms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course_id: cid })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOkMsg('Jefatura cerrada')
      await loadData()
    } catch (e: any) {
      setError(e.message || 'Error cerrando PJ')
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Administrar Profesores Jefes</h1>

      <div className="rounded-xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-medium">Asignar nuevo Profesor Jefe</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={courseId}
            onChange={e => setCourseId(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">— Curso —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </select>
          <select
            value={teacherId}
            onChange={e => setTeacherId(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">— Profesor —</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>
                {t.last_name} {t.first_name} ({t.email})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={since}
            onChange={e => setSince(e.target.value)}
            className="border rounded-md px-3 py-2"
            placeholder="Desde"
          />
          <button
            onClick={assignPJ}
            disabled={!courseId || !teacherId}
            className="bg-blue-600 text-white rounded-md px-3 py-2 flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" /> Asignar
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-medium">Listado actual</h2>
          <button onClick={loadData} className="px-3 py-2 bg-gray-200 rounded-md flex items-center gap-2">
            <RefreshCcw className="h-4 w-4" /> Recargar
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-2 px-2">Curso</th>
                <th className="text-left py-2 px-2">Profesor Jefe</th>
                <th className="text-left py-2 px-2">Desde</th>
                <th className="text-left py-2 px-2">Hasta</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={`${it.course_id}-${it.teacher_id}`} className="border-b last:border-0">
                  <td className="py-2 px-2">{it.course?.code} · {it.course?.name}</td>
                  <td className="py-2 px-2">{it.teacher ? `${it.teacher.last_name} ${it.teacher.first_name}` : it.teacher_id}</td>
                  <td className="py-2 px-2">{it.since || '—'}</td>
                  <td className="py-2 px-2">{it.until || 'vigente'}</td>
                  <td className="py-2 px-2">
                    {it.until === null && (
                      <button
                        onClick={() => closePJ(it.course_id)}
                        className="text-red-600 flex items-center gap-1"
                      >
                        <XCircle className="h-4 w-4" /> Cerrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <div className="text-rose-700">{error}</div>}
      {okMsg && <div className="text-emerald-700">{okMsg}</div>}
    </div>
  )
}
