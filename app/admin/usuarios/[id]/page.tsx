// app/admin/usuarios/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import RequireRoleClient from '../../../../components/RequireRoleClient'
import { supabase } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'

type Role = { id: number; code: string; name: string }

export default function EditUserPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [rut, setRut] = useState('')
  const [roleCode, setRoleCode] = useState('')

  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [loadingRutPass, setLoadingRutPass] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [{ data: u }, { data: ur }, { data: allRoles }] = await Promise.all([
        supabase.from('app_users').select('id, first_name, last_name, email, phone, rut').eq('id', id).maybeSingle(),
        supabase.from('user_roles').select('role_id').eq('user_id', id),
        supabase.from('roles').select('id, code, name').order('name', { ascending: true }),
      ])

      if (u) {
        setFirstName(u.first_name || '')
        setLastName(u.last_name || '')
        setEmail(u.email || '')
        setPhone(u.phone || '')
        setRut(u.rut || '')
      }
      setRoles(allRoles || [])
      const roleId = (ur && ur[0]?.role_id) || null
      const currCode = (allRoles || []).find(r => r.id === roleId)?.code || ''
      setRoleCode(currCode)

      setLoading(false)
    })()
  }, [id])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null); setErr(null); setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          rut: rut.trim() || null,
          role_code: roleCode || undefined,
        }),
      })
      const ct = res.headers.get('content-type') || ''
      const json = ct.includes('application/json') ? await res.json() : {}
      if (!res.ok) throw new Error(json?.error || 'Error al actualizar')
      setMsg('Usuario actualizado correctamente.')
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!confirm('¿Eliminar este usuario por completo?')) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error || 'Error'); return }
    router.replace('/admin/usuarios')
  }

  async function resendInvite() {
    const res = await fetch(`/api/admin/users/${id}/resend-invite`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(`Error: ${json.error || 'No se pudo reenviar.'}`); return }
    alert('Invitación reenviada.')
  }

  async function resetPassword() {
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(`Error: ${json.error || 'No se pudo generar el link.'}`); return }
    if (json.url) {
      await navigator.clipboard?.writeText(json.url).catch(() => {})
      alert(`Link de recuperación generado y copiado:\n\n${json.url}`)
    }
  }

  // 🔐 NUEVO: poner la contraseña = RUT (y forzar cambio)
  async function setPasswordToRut() {
    setLoadingRutPass(true)
    try {
      const res = await fetch(`/api/admin/users/${id}/set-password-rut`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || 'No se pudo actualizar')
        return
      }
      alert('Contraseña actualizada al RUT (se solicitará cambio al iniciar sesión).')
    } finally {
      setLoadingRutPass(false)
    }
  }

  return (
    <RequireRoleClient role="admin">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Editar usuario</h1>
          <div className="flex flex-wrap gap-2">
            <a href="/admin/usuarios" className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800">← Volver</a>
            <button onClick={resendInvite} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700">Re-invitar</button>
            <button onClick={resetPassword} className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700">Reset pass</button>
            {/* 🔐 Botón nuevo */}
            <button
              onClick={setPasswordToRut}
              disabled={loadingRutPass}
              className="rounded bg-amber-700 px-3 py-2 text-sm text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {loadingRutPass ? 'Actualizando…' : 'Usar RUT como contraseña'}
            </button>
            <button onClick={onDelete} className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700">Eliminar</button>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-600">Cargando…</div>
        ) : (
          <form onSubmit={onSave} className="rounded border bg-white p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Nombres</label>
                <input className="mt-1 w-full rounded border px-3 py-2" value={firstName} onChange={e=>setFirstName(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Apellidos</label>
                <input className="mt-1 w-full rounded border px-3 py-2" value={lastName} onChange={e=>setLastName(e.target.value)} required />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input type="email" className="mt-1 w-full rounded border px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Teléfono</label>
                <input className="mt-1 w-full rounded border px-3 py-2" value={phone} onChange={e=>setPhone(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">RUT</label>
                <input className="mt-1 w-full rounded border px-3 py-2" value={rut} onChange={e=>setRut(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Rol</label>
                <select className="mt-1 w-full rounded border px-3 py-2" value={roleCode} onChange={e=>setRoleCode(e.target.value)}>
                  <option value="">(sin rol)</option>
                  {roles.map(r => <option key={r.id} value={r.code}>{r.name} ({r.code})</option>)}
                </select>
              </div>
            </div>

            {err && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">Error: {err}</div>}
            {msg && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-sm">{msg}</div>}

            <div className="flex justify-end">
              <button disabled={saving} className="rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </RequireRoleClient>
  )
}
