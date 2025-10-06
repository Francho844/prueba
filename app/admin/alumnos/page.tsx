'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Pencil, Search, Loader2, FileText, Trash2 } from 'lucide-react'
import { Download, Upload } from 'lucide-react'

type Student = {
  id: string
  run: string | null
  first_name: string
  last_name: string
  birthdate: string | null
  phone: string | null
  created_at: string | null
}

function Button({ children, className = '', ...props }: any) {
  return (
    <button
      className={
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
        'bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60 ' + className
      }
      {...props}
    >
      {children}
    </button>
  )
}

export default function AdminAlumnosPage() {
  const [items, setItems] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // selección
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.entries(sel).filter(([, v]) => v).map(([k]) => k), [sel])
  const allOnPage = items.length > 0 && items.every(s => sel[s.id])
  const someOnPage = !allOnPage && items.some(s => sel[s.id])

  // búsqueda y paginación
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // modal crear
  const [openModal, setOpenModal] = useState(false)
  const [form, setForm] = useState<{ run: string; first_name: string; last_name: string; birthdate: string; phone: string }>({
    run: '',
    first_name: '',
    last_name: '',
    birthdate: '',
    phone: '',
  })

  useEffect(() => {
    refresh()
  }, [q, page])

  async function refresh() {
    setLoading(true)
    setError(null)
    setMsg(null)
    try {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('students')
        .select('id, run, first_name, last_name, birthdate, phone, created_at', { count: 'exact' })
        .order('last_name', { ascending: true })

      if (q.trim()) {
        const term = q.trim()
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,run.ilike.%${term}%`
        )
      }

      const { data, error } = await query.range(from, to)
      if (error) throw error

      setItems((data || []) as Student[])
      // des-seleccionar los que ya no están en página
      setSel(prev => {
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          if (!data?.some((s: any) => s.id === id)) delete next[id]
        }
        return next
      })
    } catch (e: any) {
      setError(e.message || String(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm({ run: '', first_name: '', last_name: '', birthdate: '', phone: '' })
    setOpenModal(true)
  }
  function closeModal() {
    setOpenModal(false)
  }

  async function createStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) {
      alert('Nombre y Apellido son obligatorios'); return
    }
    try {
      setSaving(true); setError(null); setMsg(null)
      const payload: any = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
      }
      if (form.run.trim()) payload.run = form.run.trim()
      if (form.phone.trim()) payload.phone = form.phone.trim()
      if (form.birthdate) payload.birthdate = form.birthdate

      const { data, error } = await supabase
        .from('students')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error

      closeModal()
      window.location.href = `/admin/alumnos/${data!.id}`
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  function toggleOne(id: string, on?: boolean) {
    setSel(prev => ({ ...prev, [id]: on ?? !prev[id] }))
  }

  function toggleAllOnPage(on: boolean) {
    setSel(prev => {
      const next = { ...prev }
      for (const s of items) next[s.id] = on
      return next
    })
  }

  async function deleteSelected() {
    setMsg(null)
    if (selectedIds.length === 0) {
      setMsg('Selecciona al menos un alumno para eliminar.')
      return
    }
    const ok = confirm(`¿Eliminar ${selectedIds.length} alumno(s)? Esto borrará sus notas, asistencias y matrículas.`)
    if (!ok) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/students/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_ids: selectedIds })
      })
      const json = await res.json()
      if (!json?.ok) throw new Error(json?.error || 'No se pudo eliminar')
      setMsg(`Eliminados: ${json.deleted}`)
      // limpiar selección y refrescar
      setSel({})
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'Error eliminando')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSingle(id: string) {
    const ok = confirm('¿Eliminar este alumno? Se borrarán sus notas, asistencias y matrículas.')
    if (!ok) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/students/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_ids: [id] })
      })
      const json = await res.json()
      if (!json?.ok) throw new Error(json?.error || 'No se pudo eliminar')
      setMsg('Alumno eliminado')
      setSel(prev => { const n = { ...prev }; delete n[id]; return n })
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'Error eliminando')
    } finally {
      setSaving(false)
    }
  }

  function buildExportUrl(base: string, q: string, selectedIds: string[]) {
    const u = new URL(base, window.location.origin)
    if (q.trim()) u.searchParams.set('q', q.trim())
    if (selectedIds.length) u.searchParams.set('ids', selectedIds.join(','))
    return u.toString()
  }

  async function exportCsvAllFiltered() {
    const url = buildExportUrl('/api/admin/students/export', q, [])
    window.location.href = url
  }

  async function exportCsvSelected() {
    if (selectedIds.length === 0) {
      setMsg('Selecciona al menos un alumno para exportar.')
      return
    }
    const url = buildExportUrl('/api/admin/students/export', '', selectedIds)
    window.location.href = url
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Barra superior */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Alumnos</h1>
          <p className="text-sm text-slate-600">Busca, visualiza, crea y elimina estudiantes.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = '/admin')} className="bg-gray-600 hover:bg-gray-700">
            ← Menú principal
          </Button>

          {/* NUEVO: Botón Importar alumnos */}
          <Button
            onClick={() => (window.location.href = '/admin/import/students')}
            className="bg-indigo-600 hover:bg-indigo-700"
            title="Ir a importar alumnos desde CSV"
          >
            <Upload className="h-4 w-4" /> Importar alumnos
          </Button>

          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nuevo alumno
          </Button>
          <Button
            onClick={exportCsvAllFiltered}
            className="bg-sky-700 hover:bg-sky-800"
            title="Exportar CSV (filtro actual)"
          >
            <Download className="h-4 w-4" /> Exportar CSV (filtro)
          </Button>
          <Button
            onClick={exportCsvSelected}
            className="bg-sky-700 hover:bg-sky-800 disabled:opacity-50"
            disabled={selectedIds.length === 0}
            title="Exportar sólo seleccionados"
          >
            <Download className="h-4 w-4" /> Exportar seleccionados
          </Button>
          <Button
            onClick={deleteSelected}
            disabled={saving || selectedIds.length === 0}
            className="bg-red-700 hover:bg-red-800 disabled:opacity-50"
            title={selectedIds.length ? `Eliminar ${selectedIds.length} seleccionado(s)` : 'Selecciona alumnos para eliminar'}
          >
            <Trash2 className="h-4 w-4" /> Eliminar seleccionados
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
          <input
            className="w-full rounded border px-8 py-2"
            placeholder="Buscar por nombre, apellido o RUN…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value) }}
          />
        </div>
        {loading && <span className="inline-flex items-center gap-1 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</span>}
        {error && <span className="text-sm text-rose-700">Error: {error}</span>}
        {msg && !error && <span className="text-sm text-emerald-700">{msg}</span>}
      </div>

      {/* Tabla */}
      {items.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-slate-600">
          {q ? 'Sin resultados.' : 'No hay alumnos registrados. Crea el primero con “Nuevo alumno”.'}
        </div>
      ) : (
        <table className="min-w-full border border-gray-300 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  ref={(el) => { if (el) el.indeterminate = someOnPage }}
                  onChange={(e) => toggleAllOnPage(e.target.checked)}
                  aria-label="Seleccionar todos"
                />
              </th>
              <th className="border px-3 py-2 text-left">RUN</th>
              <th className="border px-3 py-2 text-left">Nombre</th>
              <th className="border px-3 py-2 text-left">Nacimiento</th>
              <th className="border px-3 py-2 text-left">Teléfono</th>
              <th className="border px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!sel[s.id]}
                    onChange={(e)=>toggleOne(s.id, e.target.checked)}
                    aria-label={`Seleccionar ${s.last_name}, ${s.first_name}`}
                  />
                </td>
                <td className="border px-3 py-2">{s.run || '—'}</td>
                <td className="border px-3 py-2">{s.last_name}, {s.first_name}</td>
                <td className="border px-3 py-2">{s.birthdate || '—'}</td>
                <td className="border px-3 py-2">{s.phone || '—'}</td>
                <td className="border px-3 py-2">
                  <div className="flex items-center justify-center gap-2">
                    <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => (window.location.href = `/admin/alumnos/${s.id}`)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button className="bg-fuchsia-700 hover:bg-fuchsia-800" onClick={() => (window.open(`/admin/alumnos/${s.id}#ficha`, '_blank'))}>
                      <FileText className="h-4 w-4" /> Ficha
                    </Button>
                    <Button
                      className="bg-red-700 hover:bg-red-800"
                      onClick={() => deleteSingle(s.id)}
                      title="Eliminar este alumno"
                    >
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Paginación simple */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          className="rounded border px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          ← Anterior
        </button>
        <span className="text-sm text-slate-600">Página {page}</span>
        <button
          className="rounded border px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
          onClick={() => setPage(p => p + 1)}
          disabled={items.length < pageSize}
        >
          Siguiente →
        </button>
      </div>

      {/* Modal nuevo alumno */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nuevo alumno</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={createStudent} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">RUN</label>
                  <input className="w-full rounded border px-3 py-2" value={form.run} onChange={e => setForm(f => ({ ...f, run: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Teléfono</label>
                  <input className="w-full rounded border px-3 py-2" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nombres</label>
                  <input className="w-full rounded border px-3 py-2" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Apellidos</label>
                  <input className="w-full rounded border px-3 py-2" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Fecha de nacimiento</label>
                <input type="date" className="w-full rounded border px-3 py-2" value={form.birthdate} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))} />
              </div>
              {error && <p className="text-sm text-rose-700">Error: {error}</p>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" className="rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={closeModal}>Cancelar</button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear y abrir ficha
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
