'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Pencil, Trash2, Loader2, Copy } from 'lucide-react'

type SchoolYear = { id: number; year: number; active: boolean | null }
type Course = { id: number; name: string; code?: string }
type Subject = {
  id: number
  school_year_id: number | null
  code: string
  name: string
  course_subjects?: Array<{
    course_id: number
    courses: { id: number; name: string } | null
    hours_per_week?: number | null
  }>
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

export default function AdminAsignaturasPage() {
  const [years, setYears] = useState<SchoolYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal asignatura
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [form, setForm] = useState<{
    school_year_id: number | null
    code: string
    name: string
    course_ids: number[]
  }>({
    school_year_id: null,
    code: '',
    name: '',
    course_ids: [],
  })

  // Modal clonado
  const [openClone, setOpenClone] = useState(false)
  const [cloneFromYear, setCloneFromYear] = useState<number | ''>('')
  const [cloneResult, setCloneResult] = useState<string | null>(null)

  // Años escolares
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
      } else {
        setYears(data || [])
        const active = (data || []).find(y => y.active) || null
        setSelectedYearId(active?.id ?? (data && data[0]?.id) ?? null)
      }
      setLoading(false)
    })()
  }, [])

  // Cargar subjects y courses del año destino
  useEffect(() => {
    if (!selectedYearId) return
    ;(async () => {
      setLoading(true)
      setError(null)

      const { data: subs, error: e1 } = await supabase
        .from('subjects')
        .select(`
          id, school_year_id, code, name,
          course_subjects (
            course_id,
            hours_per_week,
            courses ( id, name )
          )
        `)
        .eq('school_year_id', selectedYearId)
        .order('code', { ascending: true })
      if (e1) setError(e1.message)
      setSubjects((subs || []) as any)

      const { data: crs, error: e2 } = await supabase
        .from('courses')
        .select('id, name, code')
        .eq('school_year_id', selectedYearId)
        .order('name')
      if (e2) setError(e2.message)
      setCourses(crs || [])

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
      course_ids: [],
    })
    setOpenModal(true)
  }

  function openEdit(s: Subject) {
    setEditing(s)
    const selected = (s.course_subjects || [])
      .map(cs => cs.course_id)
      .filter((v): v is number => typeof v === 'number')
    setForm({
      school_year_id: s.school_year_id,
      code: s.code,
      name: s.name,
      course_ids: selected,
    })
    setOpenModal(true)
  }

  function closeModal() {
    setOpenModal(false)
    setEditing(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.school_year_id) return alert('Selecciona Año Escolar')
    if (!form.code.trim()) return alert('Código es obligatorio')
    if (!form.name.trim()) return alert('Nombre es obligatorio')

    try {
      setSaving(true)
      setError(null)

      if (editing) {
        const { error: e1 } = await supabase
          .from('subjects')
          .update({ code: form.code.trim(), name: form.name.trim() })
          .eq('id', editing.id)
        if (e1) throw e1

        // Sync tabla puente
        const { error: eDel } = await supabase
          .from('course_subjects')
          .delete()
          .eq('subject_id', editing.id)
        if (eDel) throw eDel

        if (form.course_ids.length) {
          const rows = form.course_ids.map(cid => ({ course_id: cid, subject_id: editing.id }))
          const { error: eIns } = await supabase.from('course_subjects').insert(rows)
          if (eIns) throw eIns
        }
      } else {
        const { data: created, error: e1 } = await supabase
          .from('subjects')
          .insert({
            school_year_id: form.school_year_id,
            code: form.code.trim(),
            name: form.name.trim(),
          })
          .select('id')
          .single()
        if (e1) throw e1

        if (form.course_ids.length) {
          const rows = form.course_ids.map(cid => ({ course_id: cid, subject_id: created!.id }))
          const { error: e2 } = await supabase.from('course_subjects').insert(rows)
          if (e2) throw e2
        }
      }

      closeModal()
      // refrescar
      const { data: subs, error: e3 } = await supabase
        .from('subjects')
        .select(`
          id, school_year_id, code, name,
          course_subjects (
            course_id,
            hours_per_week,
            courses ( id, name )
          )
        `)
        .eq('school_year_id', selectedYearId!)
        .order('code', { ascending: true })
      if (e3) throw e3
      setSubjects((subs || []) as any)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: Subject) {
    if (!confirm(`¿Eliminar asignatura ${s.code} - ${s.name}?`)) return
    try {
      setSaving(true)
      setError(null)
      const { error } = await supabase.from('subjects').delete().eq('id', s.id)
      if (error) throw error
      setSubjects(prev => prev.filter(x => x.id !== s.id))
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // === Clonado: llama a la función SQL clone_subjects(src_year, dst_year) ===
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

      const { data, error } = await supabase.rpc('clone_subjects', {
        src_year: Number(cloneFromYear),
        dst_year: Number(selectedYear.year),
      })
      if (error) throw error

      setCloneResult(
        `Asignaturas clonadas: ${(data as any)?.inserted_subjects ?? 0}. ` +
        `Relaciones creadas: ${(data as any)?.inserted_links ?? 0}.`
      )

      // refrescar listado destino
      const { data: subs, error: e2 } = await supabase
        .from('subjects')
        .select(`
          id, school_year_id, code, name,
          course_subjects (
            course_id,
            hours_per_week,
            courses ( id, name )
          )
        `)
        .eq('school_year_id', selectedYearId!)
        .order('code', { ascending: true })
      if (e2) throw e2
      setSubjects((subs || []) as any)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Encabezado con acciones */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Asignaturas</h1>
          <p className="text-sm text-slate-600">Crea, edita, asigna a múltiples cursos y clona por año.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = '/admin')} className="bg-gray-600 hover:bg-gray-700">
            ← Menú principal
          </Button>
          <Button onClick={() => (window.location.href = '/admin/cursos')} className="bg-sky-700 hover:bg-sky-800">
            Ir a Cursos
          </Button>
          <Button onClick={openCloneModal} className="bg-indigo-700 hover:bg-indigo-800">
            <Copy className="h-4 w-4" /> Clonar asignaturas
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nueva asignatura
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Año Escolar (destino):</label>
        <select
          className="rounded border px-3 py-2"
          value={selectedYearId ?? ''}
          onChange={(e) => setSelectedYearId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Selecciona —</option>
          {years.map(y => (
            <option key={y.id} value={y.id}>
              {y.year}{y.active ? ' (activo)' : ''}
            </option>
          ))}
        </select>

        {loading && (
          <span className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </span>
        )}
        {error && <span className="text-sm text-rose-700">Error: {error}</span>}
      </div>

      {/* Tabla */}
      {!selectedYear ? (
        <p className="text-slate-600">Selecciona un <strong>Año Escolar</strong> destino.</p>
      ) : subjects.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-slate-600">
          No hay asignaturas para {selectedYear?.year}. Crea una con <strong>“Nueva asignatura”</strong> o usa <strong>“Clonar asignaturas”</strong>.
        </div>
      ) : (
        <table className="min-w-full border border-gray-300 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Código</th>
              <th className="border px-3 py-2 text-left">Nombre</th>
              <th className="border px-3 py-2 text-left">Cursos asignados</th>
              <th className="border px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const cursos = (s.course_subjects || [])
                .map(cs => cs.courses?.name)
                .filter(Boolean)
                .join(', ')
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{s.code}</td>
                  <td className="border px-3 py-2">{s.name}</td>
                  <td className="border px-3 py-2">{cursos || '—'}</td>
                  <td className="border px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                      <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => remove(s)} disabled={saving}>
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Modal crear/editar asignatura */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Editar asignatura' : 'Nueva asignatura'}</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={save} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Código</label>
                  <input
                    type="text"
                    className="w-full rounded border px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="MAT-1B, HIS-2M…"
                    maxLength={20}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Nombre</label>
                  <input
                    type="text"
                    className="w-full rounded border px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Matemática 1° Básico A"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Cursos (puedes seleccionar varios)</label>
                <select
                  multiple
                  className="h-44 w-full rounded border px-3 py-2"
                  value={form.course_ids.map(String)}
                  onChange={(e) => {
                    const vals = Array.from(e.target.selectedOptions).map(o => Number(o.value))
                    setForm(f => ({ ...f, course_ids: vals }))
                  }}
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Usa Ctrl/Cmd + clic para seleccionar múltiples cursos.</p>
              </div>

              {error && <p className="text-sm text-rose-700">Error: {error}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" className="rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={closeModal}>
                  Cancelar
                </button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? 'Guardar cambios' : 'Crear asignatura'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal clonar asignaturas */}
      {openClone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Clonar asignaturas</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeCloneModal}>✕</button>
            </div>

            <form onSubmit={runClone} className="space-y-3">
              <div className="text-sm text-slate-600">
                <p>Destino: <strong>{selectedYear?.year ?? '—'}</strong></p>
                <p className="mt-1">Elige el <strong>año ORIGEN</strong> desde el cual copiar asignaturas y vínculos a cursos.</p>
                <p className="mt-1">Nota: Los cursos del destino deben existir con el <strong>mismo código</strong> para clonar las relaciones.</p>
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
