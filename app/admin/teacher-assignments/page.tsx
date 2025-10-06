'use client'
import { useEffect, useMemo, useState } from 'react'

type UserItem = { id: string, email: string, name: string }
type CSItem = {
  id: number, // course_subjects.id
  course: { id: number, code: string, name: string, school_year_id: number },
  subject: { id: number, code: string|null, name: string },
  hours_per_week: number | null
}

export default function TeacherAssignmentsPage() {
  const [qUser, setQUser] = useState('')
  const [users, setUsers] = useState<UserItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<UserItem | null>(null)

  const [items, setItems] = useState<CSItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [filterCourse, setFilterCourse] = useState('')
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function searchUsers() {
    const term = qUser.trim()
    setMsg(null)
    if (!term) { setUsers([]); return }
    setLoadingUsers(true)
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(term)}`)
      const json = await res.json()
      if (json?.ok) setUsers(json.items || [])
      else setMsg(json?.error || 'Error buscando usuarios')
    } catch (e:any) {
      setMsg(e?.message || 'Error buscando usuarios')
    } finally {
      setLoadingUsers(false)
    }
  }

  async function loadItems() {
    setLoadingItems(true)
    setMsg(null)
    try {
      const params = new URLSearchParams()
      if (filterCourse) params.set('course', filterCourse)
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/course-subjects?${params.toString()}`)
      const json = await res.json()
      if (json?.ok) setItems(json.items || [])
      else setMsg(json?.error || 'Error cargando cursos/ramos')
    } catch (e:any) {
      setMsg(e?.message || 'Error cargando cursos/ramos')
    } finally {
      setLoadingItems(false)
    }
  }
  useEffect(() => { loadItems() }, [])

  // Preselección cuando eliges profe
  useEffect(() => {
    async function loadAssignments() {
      setSelected({})
      if (!selectedTeacher) return
      try {
        const res = await fetch(`/api/admin/teacher-assignments?teacher=${encodeURIComponent(selectedTeacher.id)}`)
        const json = await res.json()
        if (json?.ok) {
          const next: Record<number, boolean> = {}
          for (const id of (json.cs_ids || [])) next[Number(id)] = true
          setSelected(next)
        }
      } catch {}
    }
    loadAssignments()
  }, [selectedTeacher])

  const courseOptions = useMemo(() => {
    const set = new Map<string, string>()
    for (const it of items) if (it.course?.code) set.set(it.course.code, it.course.name)
    return Array.from(set.entries()).map(([code, name]) => ({ code, name }))
      .sort((a,b) => a.name.localeCompare(b.name, 'es'))
  }, [items])

  const grouped = useMemo(() => {
    const groups = new Map<string, CSItem[]>()
    for (const it of items
      .filter(s => !filterCourse || s.course?.code === filterCourse)
      .filter(s => !q || s.subject.name.toLowerCase().includes(q.toLowerCase()))
    ) {
      const key = `${it.course?.name ?? 'Sin curso'} · ${it.course?.code ?? ''}`
      const arr = groups.get(key) || []
      arr.push(it)
      groups.set(key, arr)
    }
    for (const [k, arr] of groups.entries()) {
      arr.sort((a,b) => (a.subject.name || '').localeCompare(b.subject.name || '', 'es'))
      groups.set(k, arr)
    }
    return groups
  }, [items, filterCourse, q])

  function toggle(id: number, on?: boolean) {
    setSelected(prev => ({ ...prev, [id]: on ?? !prev[id] }))
  }
  function toggleGroup(arr: CSItem[], on: boolean) {
    setSelected(prev => {
      const next = { ...prev }
      for (const it of arr) next[it.id] = on
      return next
    })
  }

  async function save() {
    if (!selectedTeacher) { setMsg('Selecciona un profesor'); return }
    const cs_ids = Object.entries(selected).filter(([,v]) => v).map(([k]) => Number(k))
    if (!cs_ids.length) { setMsg('Selecciona al menos un ramo'); return }
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/teacher-assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teacher_id: selectedTeacher.id, cs_ids }),
      })
      const json = await res.json()
      if (!json?.ok) throw new Error(json?.error || 'No se pudo asignar')
      setMsg(`Asignado ${cs_ids.length} ramo(s) a ${selectedTeacher.email}`)
    } catch (e:any) {
      setMsg(e?.message || 'Error guardando asignaciones')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Asignar Ramos a Profesores</h1>

      {/* Buscar profesor */}
      <section className="rounded-2xl border p-4 bg-white space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm mb-1">Buscar (nombre o email)</label>
            <input value={qUser} onChange={(e)=>setQUser(e.target.value)} className="w-full rounded-md border px-3 py-2" />
          </div>
          <button onClick={searchUsers} disabled={loadingUsers} className="rounded-md border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {loadingUsers ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {users.length > 0 && (
          <div className="mt-2">
            <label className="block text-sm mb-1">Selecciona profesor</label>
            <select
              value={selectedTeacher?.id || ''}
              onChange={(e)=>setSelectedTeacher(users.find(x => x.id === e.target.value) || null)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">— Elegir —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {(u.name ? `${u.name} · ${u.email}` : u.email)}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Filtros + listado agrupado */}
      <section className="rounded-2xl border p-4 bg-white space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm mb-1">Filtrar por curso</label>
            <select value={filterCourse} onChange={(e)=>setFilterCourse(e.target.value)} className="w-full rounded-md border px-3 py-2">
              <option value="">Todos</option>
              {courseOptions.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Buscar ramo</label>
            <input value={q} onChange={(e)=>setQ(e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder="Matemática, Lenguaje…" />
          </div>
          <div className="flex items-end">
            <button onClick={loadItems} disabled={loadingItems} className="rounded-md border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
              {loadingItems ? 'Cargando…' : 'Aplicar filtros'}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-4">
          {Array.from(grouped.entries()).map(([groupLabel, arr]) => {
            const ids = arr.map(it => it.id)
            const allOn = ids.every(id => selected[id])
            const someOn = !allOn && ids.some(id => selected[id])
            return (
              <div key={groupLabel} className="rounded-xl border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">{groupLabel}</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={el => { if (el) el.indeterminate = someOn }}
                      onChange={(e)=>toggleGroup(arr, e.target.checked)}
                    />
                    Seleccionar todo
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {arr.map(it => (
                    <label key={it.id} className="rounded-lg border p-3 flex gap-2 items-start">
                      <input
                        type="checkbox"
                        checked={!!selected[it.id]}
                        onChange={(e)=>toggle(it.id, e.target.checked)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{it.subject.name}</div>
                        <div className="text-xs text-gray-500">{it.course.name} · {it.course.code}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {Array.from(grouped.keys()).length === 0 && (
            <div className="rounded-xl border p-4 bg-gray-50">No hay ramos con los filtros actuales.</div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={save} disabled={saving || !selectedTeacher} className="rounded-md border px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Asignar seleccionados'}
          </button>
          {msg && <div className="text-sm text-gray-700">{msg}</div>}
        </div>
      </section>
    </main>
  )
}
