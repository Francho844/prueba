// app/admin/usuarios/nuevo/page.tsx
'use client'

import { useMemo, useState } from 'react'
import RequireRoleClient from '../../../../components/RequireRoleClient'

// Normaliza el RUT: quita puntos/espacios, mantiene guion y dv (minúsculas)
function normalizeRut(input?: string | null): string | null {
  if (!input) return null
  const s = input.toString().trim().replace(/\./g, '').replace(/\s+/g, '')
  return s.toLowerCase()
}

export default function NewUserPage() {
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [email, setEmail]           = useState('')
  const [phone, setPhone]           = useState('')
  const [rut, setRut]               = useState('')
  const [roleCode, setRoleCode]     = useState<'admin' | 'teacher' | 'guardian' | 'student'>('teacher')

  const [sendInvite, setSendInvite] = useState(true)       // Invitación por email
  const [password, setPassword]     = useState('')         // Usado si NO hay invitación
  const [useRutPass, setUseRutPass] = useState(false)      // Nuevo: usar RUT como contraseña (no alumnos)

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [msg, setMsg]       = useState<string | null>(null)

  // Si se marca "Usar RUT como contraseña", forzamos no enviar invitación
  function toggleUseRutPass(checked: boolean) {
    setUseRutPass(checked)
    if (checked) {
      setSendInvite(false)
      setPassword('') // no se usa
    }
  }

  // Si el rol es "student", no permitimos usar rut como contraseña
  const rutPassDisabled = roleCode === 'student'
  const rutPassHelp = useMemo(() => {
    if (rutPassDisabled) return 'Solo disponible para Admin/Profesor/Apoderado.'
    return 'Se establecerá la contraseña igual al RUT normalizado.'
  }, [rutPassDisabled])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null); setSaving(true)
    try {
      // Validaciones rápidas
      if (!firstName.trim() || !lastName.trim() || !email.trim() || !roleCode) {
        throw new Error('Completa nombre, apellido, email y rol.')
      }

      // Si se usa RUT como contraseña (solo no alumnos)
      let payloadPassword: string | undefined = undefined
      let payloadSendInvite = sendInvite

      if (useRutPass) {
        if (rutPassDisabled) {
          throw new Error('No puedes usar el RUT como contraseña para alumnos.')
        }
        const rutNorm = normalizeRut(rut)
        if (!rutNorm || rutNorm.length < 3) {
          throw new Error('RUT inválido para usar como contraseña.')
        }
        payloadPassword = rutNorm
        payloadSendInvite = false // imprescindible
      } else if (!sendInvite) {
        // Caso password manual
        if (!password || password.length < 8) {
          throw new Error('Debes indicar una contraseña de al menos 8 caracteres, o activar “Enviar invitación”.')
        }
        payloadPassword = password
      }

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name : firstName.trim(),
          last_name  : lastName.trim(),
          email      : email.trim(),
          phone      : phone.trim() || null,
          rut        : rut.trim() || null,
          role_code  : roleCode,
          send_invite: payloadSendInvite,
          password   : payloadPassword, // si va undefined y send_invite=true, el backend invita
        }),
      })

      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        const text = await res.text()
        throw new Error(`Respuesta no-JSON del servidor (status ${res.status}). Detalle: ${text.slice(0, 500)}…`)
      }

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || `Error ${res.status}`)
      }

      setMsg(`Usuario creado correctamente. ID: ${json.user_id}`)
      // Limpia el formulario si quieres
      // setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setRut('');
      // setRoleCode('teacher'); setSendInvite(true); setPassword(''); setUseRutPass(false)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <RequireRoleClient role="admin">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Crear usuario</h1>
          <a href="/admin/usuarios" className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800">← Volver</a>
        </div>

        <form onSubmit={onSubmit} className="rounded border bg-white p-4 space-y-4">
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
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={roleCode}
                onChange={e => setRoleCode(e.target.value as any)}
              >
                <option value="admin">Administrador</option>
                <option value="teacher">Profesor</option>
                <option value="guardian">Apoderado</option>
                <option value="student">Alumno</option>
              </select>
            </div>
          </div>

          <div className="rounded border p-3 space-y-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={e => setSendInvite(e.target.checked)}
                disabled={useRutPass} // si usamos RUT como pass, no invitamos
              />
              <span className="text-sm">
                Enviar invitación por email (el usuario define su contraseña)
              </span>
            </label>

            <label className="mt-1 flex items-start gap-2">
              <input
                type="checkbox"
                checked={useRutPass}
                onChange={e => toggleUseRutPass(e.target.checked)}
                disabled={rutPassDisabled}
              />
              <div className="text-sm">
                <div className="font-medium">Usar RUT como contraseña (no alumnos)</div>
                <div className="text-xs text-slate-500">{rutPassHelp}</div>
              </div>
            </label>

            {/* Contraseña manual solo cuando NO hay invitación y NO usamos RUT */}
            {!sendInvite && !useRutPass && (
              <div className="mt-1">
                <label className="text-sm font-medium">Password (mín. 8)</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                />
                <div className="mt-1 text-xs text-slate-500">
                  Si desmarcas invitación, debes definir la contraseña aquí.
                </div>
              </div>
            )}
          </div>

          {err && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">Error: {err}</div>}
          {msg && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-sm">{msg}</div>}

          <div className="flex justify-end">
            <button
              disabled={saving}
              className="rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              {saving ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </RequireRoleClient>
  )
}
