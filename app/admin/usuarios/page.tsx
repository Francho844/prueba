'use client'

import { useEffect, useMemo, useState } from 'react'
import RequireRoleClient from '../../../components/RequireRoleClient'
import { supabase } from '../../../lib/supabase'

type Row = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  rut: string | null
  roles?: { code: string }[] // construimos con un map
}

type Role = { id: number; code: string; name: string }

export default function UsersListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  async function load() {
    setLoading(true)
    // usuarios + sus roles (join manual)
    const { data: users } = await supabase
      .from('app_users')
      .select('id, first_name, last_name, email, phone, rut')
      .order('last_name', { ascending: true })

    const { data: ur } = await supabase
      .from('user_roles')
      .select('user_id, role_id')

    const { data: allRoles } = await supabase
      .from('roles')
      .select('id, code, name')
      .order('name', { ascending: true })

    setRoles(allRoles || [])

    const byUser: Record<string, string[]> = {}
    ;(ur || []).forEach(r => {
      const roleCode = (allRoles || []).find(x => x.id === r.role_id)?.code
      if (!roleCode) return
      if (!byUser[r.user_id]) byUser[r.user_id] = []
      byUser[r.user_id].push(roleCode)
    })

    const merged: Row[] = (users || []).map(u => ({
      ...u,
      roles: (byUser[u.id] || []).map(code => ({ code }))
    })) as any

    setRows(merged)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(r => {
      const matchText = !term || [
        r.first_name, r.last_name, r.email ?? '', r.rut ?? '', r.phone ?? ''
      ].some(t => t?.toLowerCase().includes(term))
      const matchRole = !roleFilter || (r.roles || []).some(rr => rr.code === roleFilter)
      return matchText && matchRole
    })
  }, [rows, q, roleFilter])

  async function doDelete(id: string) {
    if (!confirm('¿Eliminar este usuario por completo? Esta acción no se puede deshacer.')) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(`Error eliminando: ${json.error || 'desconocido'}`)
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
  }
  // ...dentro del componente:
  async function resendInvite(id: string) {
    const res = await fetch(`/api/admin/users/${id}/resend-invite`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(`Error: ${json.error || 'No se pudo reenviar.'}`); return }
      alert('Invitación reenviada.')
  }

  async function resetPassword(id: string) {
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(`Error: ${json.error || 'No se pudo generar el link.'}`); return }
  // Muestra el link para copiar y compartir al usuario
    if (json.url) {
    await navigator.clipboard?.writeText(json.url).catch(() => {})
    alert(`Link de recuperación generado y copiado al portapapeles:\n\n${json.url}`)
  } else {
    alert('Link generado, pero no se pudo leer la URL.')
  }
}

  return (
    <RequireRoleClient role="admin">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <div className="flex gap-2">
            <a href="/admin" className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">← Inicio</a>
            <a href="/admin/usuarios/nuevo" className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800">+ Crear usuario</a>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <input
            className="rounded border px-3 py-2"
            placeholder="Buscar por nombre, email, RUT, teléfono…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select
            className="rounded border px-3 py-2"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">Todos los roles</option>
            {roles.map(r => <option key={r.id} value={r.code}>{r.name} ({r.code})</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-slate-600">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-600">Sin resultados.</div>
        ) : (
          <div className="overflow-x-auto rounded border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">RUT</th>
                  <th className="px-3 py-2 text-left">Teléfono</th>
                  <th className="px-3 py-2 text-left">Roles</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.last_name}, {u.first_name}</td>
                    <td className="px-3 py-2">{u.email || '—'}</td>
                    <td className="px-3 py-2">{u.rut || '—'}</td>
                    <td className="px-3 py-2">{u.phone || '—'}</td>
                    <td className="px-3 py-2">
                      {(u.roles || []).map(r => r.code).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/admin/usuarios/${u.id}`} className="rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 mr-2">Editar</a>
                      <button onClick={() => resendInvite(u.id)} className="rounded bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700 mr-2">Re-invitar</button>
                      <button onClick={() => resetPassword(u.id)} className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 mr-2">Reset pass</button>
                      <button onClick={() => doDelete(u.id)} className="rounded bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-700">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRoleClient>
  )
}
