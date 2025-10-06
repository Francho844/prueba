'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { syncServerCookies, pickDestination } from './helpers'
import { runToEmail, normalizeRun, isValidRun } from '@/lib/run'

const DOMAIN = process.env.NEXT_PUBLIC_RUN_LOGIN_DOMAIN || 'estudiante.stc'
const looksLikeEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

export default function LoginPage() {
  const router = useRouter()
  const qp = useSearchParams()
  const [userInput, setUserInput] = useState('')   // RUN o email
  const [password, setPassword] = useState('')     // puede ser RUN
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // 1) Posibles emails a probar
      let emailsToTry: string[] = []
      if (looksLikeEmail(userInput)) {
        emailsToTry = [userInput.trim()]
      } else {
        const runNorm = normalizeRun(userInput)
        if (!isValidRun(runNorm)) throw new Error('RUN inválido')
        const withDash = `${runNorm}@${DOMAIN}`                // 12345678-9@estudiante.stc
        const noDash = `${runNorm.replace('-', '')}@${DOMAIN}` // 123456789@estudiante.stc
        emailsToTry = [withDash, noDash]
      }
      emailsToTry = Array.from(new Set(emailsToTry))

      // 2) Posibles contraseñas a probar
      let pwToTry: string[] = []
      const p0 = password.trim()
      pwToTry.push(p0)
      if (!looksLikeEmail(userInput)) {
        const pn = normalizeRun(p0)          // 12345678-9
        const pn2 = pn.replace('-', '')      // 123456789
        pwToTry.push(pn, pn2)
      }
      pwToTry = Array.from(new Set(pwToTry))

      // 3) Intento de login capturando la SESIÓN devuelta
      let logged = false
      let sessionOk: import('@supabase/supabase-js').Session | null = null
      let lastError: any = null

      for (const email of emailsToTry) {
        for (const pw of pwToTry) {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw })
          if (!error) {
            sessionOk = data?.session ?? null
            logged = true
            break
          }
          lastError = error
        }
        if (logged) break
      }

      if (!logged || !sessionOk) {
        throw new Error(lastError?.message || 'Credenciales inválidas. Verifica tu RUN y contraseña (incluye el guion y DV).')
      }

      // 4) Sincroniza cookies httpOnly en el servidor con los TOKENS de esa sesión
      await syncServerCookies(sessionOk.access_token, sessionOk.refresh_token)

      // 5) Refresca para que middleware/SSR lean la nueva cookie
      router.refresh()

      // 6) Decide destino desde el server y redirige
      const { data: { user } } = await supabase.auth.getUser()
      const dest = await pickDestination(user?.id || '', qp.get('redirect'))
      window.location.href = dest
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold mb-4">Ingresar</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">RUN o Email</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Ej: 12345678-9"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Contraseña</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ej: 12345678-9"
            autoComplete="current-password"
          />
          <p className="mt-1 text-xs text-slate-500">
            Para alumnos nuevos: tu contraseña inicial es tu RUN (con guion y DV).
          </p>
        </div>
        {error && <div className="text-rose-700 text-sm">{error}</div>}
        <button
          disabled={loading}
          className="w-full rounded bg-slate-800 text-white py-2 hover:bg-slate-900 disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
            </span>
          ) : (
            'Entrar'
          )}
        </button>
      </form>
    </div>
  )
}
