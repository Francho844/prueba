'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Pencil, Trash2, Loader2, Copy, ExternalLink } from 'lucide-react'

type SchoolYear = { id: number; year: number; active: boolean | null }
type Course = {
  id: number
  school_year_id: number | null
  code: string
  name: string
  jornada: string | null
  school_years?: { year: number } | null
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

export default function AdminCursosPage() {
  const [years, setYears] = useState<SchoolYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal curso
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState<{ school_year_id: number | null; code: string; name: string; jornada: string }>({
    school_year_id: null,
    code: '',
    name: '',
    jornada: 'mañana',
  })

  // Modal clonar
  const [openClone, setOpenClone] = useState(false)
  const [cloneFromYear, setCloneFromYear] = useState<number | ''>('')  // año origen (numérico)
  const [cloneResult, setCloneResult] = useState<string | null>(null)

  // Carga años escolares
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('school_years')
        .select('id, year, active')
        .order('year', { ascending: false })
      if (error) {
        setError(error.message)
        setYears([])
      } else {
        setYears(data || [])
        const active = (data || []).find(y => y.active) || null
        setSelectedYearId(active?.id ?? (data && data[0]?.id) ?? null)
      }
      setLoading(false)
    })()
  }, [])

  // Carga cursos del año seleccionado
  useEffect(() => {
    if (!selectedYearId) return
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('courses')
        .select('id, school_year_id, code, name, jornada, school_years(id, year)')
        .eq('school_year_id', selectedYearId)
        .order('code', { ascending: true })
      if (error) {
        setError(error.message)
        setCourses([])
      } else {
        setCourses((data || []) as any)
      }
      setLoading(false)
    })()
  }, [selectedYearId])

  const selectedYear = useMemo(
    () => years.find(y => y.id === selectedYearId) || null,
    [years, selectedYearId]
  )

  function openCreate() {
    setEditing(null)
    setForm({
      school_year_id: selectedYearId,
      code: '',
      name: '',
      jornada: 'mañana',
    })
    setOpenModal(true)
  }

  function openEdit(c: Course) {
    setEditing(c)
    setForm({
      school_year_id: c.school_year_id ?? selectedYearId,
      code: c.code,
      name: c.name,
      jornada: c.jornada || 'mañana',
    })
    setOpenModal(true)
  }

  function closeModal() {
    setOpenModal(false)
    setEditing(null)
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!form.school_year_id) return alert('Selecciona Año Escolar')
    if (!form.code.trim()) return alert('Código es obligatorio')
    if (!form.name.trim()) return alert('Nombre es obligatorio')

    try {
      setSaving(true)
      setError(null)
      if (editing) {
        const { error } = await supabase
          .from('courses')
          .update({
            school_year_id: form.school_year_id,
            code: form.code.trim(),
            name: form.name.trim(),
            jornada: form.jornada || null,
          })
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('courses')
          .insert({
            school_year_id: form.school_year_id,
            code: form.code.trim(),
            name: form.name.trim(),
            jornada: form.jornada || null,
          })
        if (error) throw error
      }
      closeModal()
      // refresca
      const { data, error: err2 } = await supabase
        .from('courses')
        .select('id, school_year_id, code, name, jornada, school_years(id, year)')
        .eq('school_year_id', selectedYearId!)
        .order('code', { ascending: true })
      if (err2) throw err2
      setCourses((data || []) as any)
    } catch (e: any) {
      if (e?.message?.includes('uq_courses_year_code')) {
        setError('Ya existe un curso con ese CÓDIGO en el Año Escolar seleccionado.')
      } else {
        setError(e.message || String(e))
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteCourse(c: Course) {
    if (!confirm(`¿Eliminar curso ${c.code} - ${c.name}?`)) return
    try {
      setSaving(true)
      setError(null)
      const { error } = await supabase.from('courses').delete().eq('id', c.id)
      if (error) throw error
      setCourses(prev => prev.filter(x => x.id !== c.id))
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // === Clonado: llama a la función SQL clone_courses(src_year, dst_year) ===
  function openCloneModal() {
    setCloneFromYear('')
    setCloneResult(null)
    setOpenClone(true)
  }
  function closeCloneModal() {
    setOpenClone(false)
  }
  async function runClone(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedYear) return alert('Selecciona primero el Año Escolar destino.')
    if (!cloneFromYear) return alert('Indica el año ORIGEN a clonar.')

    try {
      setSaving(true)
      setError(null)
      setCloneResult(null)

      const { data, error } = await supabase.rpc('clone_courses', {
        src_year: Number(cloneFromYear),
        dst_year: Number(selectedYear.year),
      })
      if (error) throw error

      setCloneResult(`Se clonaron ${data ?? 0} curso(s) desde ${cloneFromYear} a ${selectedYear.year}.`)

      const { data: refreshed, error: e2 } = await supabase
        .from('courses')
        .select('id, school_year_id, code, name, jornada, school_years(id, year)')
        .eq('school_year_id', selectedYearId!)
        .order('code', { ascending: true })
      if (e2) throw e2
      setCourses((refreshed || []) as any)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Encabezado */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cursos</h1>
          <p className="text-sm text-slate-600">Crea, edita, elimina y clona cursos entre Años Escolares.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = '/admin')} className="bg-gray-600 hover:bg-gray-700">
            ← Menú principal
          </Button>
          <Button onClick={openCloneModal} className="bg-sky-700 hover:bg-sky-800">
            <Copy className="h-4 w-4" /> Clonar cursos
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nuevo curso
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Año Escolar (destino):</label>
        <select
          className="rounded border px-3 py-2"
          value={selectedYearId ?? ''}
          onChange={(e) => setSelectedYearId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Selecciona —</option>
          {years.map(y => (
            <option key={y.id} value={y.id}>{y.year}{y.active ? ' (activo)' : ''}</option>
          ))}
        </select>
        {loading && (
          <span className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </span>
        )}
        {error && <span className="text-sm text-rose-700">Error: {error}</span>}
      </div>

      {!selectedYear ? (
        <p className="text-slate-600">Primero selecciona un <strong>Año Escolar</strong> destino.</p>
      ) : courses.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-slate-600">
          No hay cursos para {selectedYear?.year}. Crea uno con <strong>“Nuevo curso”</strong> o usa <strong>“Clonar cursos”</strong>.
        </div>
      ) : (
        <table className="min-w-full border border-gray-300 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Código</th>
              <th className="border px-3 py-2 text-left">Nombre</th>
              <th className="border px-3 py-2 text-left">Jornada</th>
              <th className="border px-3 py-2 text-left">Año</th>
              <th className="border px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2">{c.code}</td>
                <td className="border px-3 py-2">{c.name}</td>
                <td className="border px-3 py-2">{c.jornada || '—'}</td>
                <td className="border px-3 py-2">{c.school_years?.year ?? '—'}</td>
                <td className="border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* NUEVO: abrir detalle del curso (alumnos/electivos) */}
                    <Button
                      className="bg-indigo-700 hover:bg-indigo-800"
                      onClick={() => (window.location.href = `/admin/cursos/${c.id}`)}
                      title="Abrir detalle (Alumnos / Electivos)"
                    >
                      <ExternalLink className="h-4 w-4" /> Abrir
                    </Button>

                    <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteCourse(c)} disabled={saving}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal crear/editar */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Editar curso' : 'Nuevo curso'}</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={saveCourse} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Año escolar</label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={form.school_year_id ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, school_year_id: e.target.value ? Number(e.target.value) : null }))}
                  required
                >
                  <option value="">— Selecciona —</option>
                  {years.map(y => (
                    <option key={y.id} value={y.id}>{y.year}{y.active ? ' (activo)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Código</label>
                  <input
                    type="text"
                    className="w-full rounded border px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="EJ: 1B-A, 7B-B, 4M-H"
                    maxLength={12}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Jornada</label>
                  <select
                    className="w-full rounded border px-3 py-2"
                    value={form.jornada}
                    onChange={(e) => setForm(f => ({ ...f, jornada: e.target.value }))}
                  >
                    <option value="mañana">Mañana</option>
                    <option value="tarde">Tarde</option>
                    <option value="completa">Jornada completa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Nombre</label>
                <input
                  type="text"
                  className="w-full rounded border px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: 1° Básico A / 2° Medio B"
                  required
                />
              </div>

              {error && <p className="text-sm text-rose-700">Error: {error}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" className="rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={closeModal}>
                  Cancelar
                </button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? 'Guardar cambios' : 'Crear curso'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal clonar cursos */}
      {openClone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Clonar cursos</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeCloneModal}>✕</button>
            </div>

            <form onSubmit={runClone} className="space-y-3">
              <div className="text-sm text-slate-600">
                <p>Destino: <strong>{selectedYear?.year ?? '—'}</strong></p>
                <p className="mt-1">Elige el <strong>año ORIGEN</strong> desde el cual copiar todos los cursos.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Año origen</label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={cloneFromYear === '' ? '' : cloneFromYear}
                  onChange={(e) => setCloneFromYear(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">— Selecciona —</option>
                  {years.map(y => (
                    <option key={y.id} value={y.year}>{y.year}{y.active ? ' (activo)' : ''}</option>
                  ))}
                </select>
              </div>

              {cloneResult && <p className="text-sm text-emerald-700">{cloneResult}</p>}
              {error && <p className="text-sm text-rose-700">Error: {error}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" className="rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={closeCloneModal}>
                  Cerrar
                </button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Clonar ahora
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
