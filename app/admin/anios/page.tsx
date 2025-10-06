'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Pencil, Trash2, CheckCircle2, Loader2 } from 'lucide-react'

type SchoolYear = { id: number; year: number; active: boolean | null }

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

export default function AdminAniosPage() {
  const [list, setList] = useState<SchoolYear[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<SchoolYear | null>(null)
  const [formYear, setFormYear] = useState<number | ''>('')

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('school_years')
      .select('id, year, active')
      .order('year', { ascending: false })
    if (error) {
      setError(error.message)
      setList([])
    } else {
      setList(data || [])
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormYear(new Date().getFullYear())
    setOpenModal(true)
  }
  function openEdit(y: SchoolYear) {
    setEditing(y)
    setFormYear(y.year)
    setOpenModal(true)
  }
  function closeModal() {
    setOpenModal(false)
    setEditing(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const y = Number(formYear)
    if (!y || y < 2000 || y > 2100) {
      alert('Año inválido'); return
    }
    try {
      setSaving(true); setError(null)
      if (editing) {
        const { error } = await supabase.from('school_years').update({ year: y }).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('school_years').insert({ year: y, active: false })
        if (error) throw error
      }
      closeModal()
      await refresh()
    } catch (e: any) {
      if (e?.message?.toLowerCase().includes('duplicate')) {
        setError('Ese año ya existe.')
      } else {
        setError(e.message || String(e))
      }
    } finally {
      setSaving(false)
    }
  }

  async function setActive(y: SchoolYear) {
    if (y.active) return
    if (!confirm(`Marcar ${y.year} como Año Escolar ACTIVO y desactivar el resto?`)) return
    try {
      setSaving(true); setError(null)
      // desactiva todos y activa uno (en transacción simple)
      const { error: e1 } = await supabase.from('school_years').update({ active: false }).neq('id', y.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('school_years').update({ active: true }).eq('id', y.id)
      if (e2) throw e2
      await refresh()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(y: SchoolYear) {
    if (!confirm(`¿Eliminar el Año Escolar ${y.year}?`)) return
    try {
      setSaving(true); setError(null)
      // (opcional) bloquear si tiene cursos asociados: valida en servidor/BD si quieres.
      const { error } = await supabase.from('school_years').delete().eq('id', y.id)
      if (error) throw error
      setList(prev => prev.filter(i => i.id !== y.id))
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Años Escolares</h1>
          <p className="text-sm text-slate-600">Administra los años disponibles y cuál está activo.</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => (window.location.href = '/matriculas/ficha')}
            className="bg-gray-600 hover:bg-gray-700"
          >
            ← Matricula
          </Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo año</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-600 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      ) : list.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-slate-600">
          No hay años creados. Pulsa <strong>“Nuevo año”</strong>.
        </div>
      ) : (
        <table className="min-w-full border border-gray-300 bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2 text-left">Año</th>
              <th className="border px-3 py-2 text-left">Activo</th>
              <th className="border px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((y) => (
              <tr key={y.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2">{y.year}</td>
                <td className="border px-3 py-2">
                  {y.active ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Activo</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="border px-3 py-2">
                  <div className="flex items-center justify-center gap-2">
                    {!y.active && (
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setActive(y)} disabled={saving}>
                        <CheckCircle2 className="h-4 w-4" /> Activar
                      </Button>
                    )}
                    <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => openEdit(y)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => remove(y)} disabled={saving}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="mt-3 text-sm text-rose-700">Error: {error}</p>}

      {/* Modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Editar año' : 'Nuevo año'}</h2>
              <button className="text-slate-500 hover:text-slate-700" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Año</label>
                <input
                  type="number"
                  className="w-full rounded border px-3 py-2"
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value ? Number(e.target.value) : '')}
                  min={2000}
                  max={2100}
                  required
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" className="rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={closeModal}>
                  Cancelar
                </button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? 'Guardar cambios' : 'Crear año'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
