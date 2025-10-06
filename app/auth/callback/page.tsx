'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type Role = 'admin' | 'teacher' | 'profesor' | 'docente' | 'student' | string

async function syncServerCookies() {
  // Toma la sesión del cliente y la replica como cookies httpOnly en tu API
  const { data: { session } } = await supabase.auth.getSession()
  const access_token = session?.access_token
  const refresh_token = session?.refresh_token
  if (!access_token || !refresh_token) return
  try {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token }),
    })
  } catch {
    // Si falla la sincronización no bloqueamos el flujo de login del cliente.
  }
}

function parseHashTokens():
  | { access_token: string; refresh_token: string }
  | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  if (!hash.startsWith('#')) return null
  const params = new URLSearchParams(hash.slice(1))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (access_token && refresh_token) return { access_token, refresh_token }
  return null
}

async function pickDestination(redirectParam: string | null): Promise<string> {
  if (redirectParam) return redirectParam
  const { data: { user } } = await supabase.auth.getUser()
  // Si no hay usuario aún, manda al login.
  if (!user) return '/login'
  // RLS te deja leer solo tu perfil
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = (data?.role || 'student') as Role
  const r = String(role).toLowerCase()
  if (r === 'admin') return '/admin'
  if (r === 'teacher' || r === 'profesor' || r === 'docente') return '/teacher'
  return '/dashboard'
}

export default function AuthCallbackPage() {
  const qp = useSearchParams()
  const router = useRouter()
  const [msg, setMsg] = useState('Procesando inicio de sesión…')

  useEffect(() => {
    ;(async () => {
      // 1) Errores del proveedor
      const errDesc = qp.get('error_description') || qp.get('error')
      if (errDesc) {
        setMsg(decodeURIComponent(errDesc))
        return
      }

      let sessionOK = false

      // 2) Flujo moderno: ?code=... (PKCE)
      const code = qp.get('code')
      if (code) {
        try {
          // v2 suele aceptar objeto { code }. Si tu SDK usa otra firma, ajústalo.
          const { error } = await (supabase.auth as any).exchangeCodeForSession({ code })
          if (error) throw error
          sessionOK = true
        } catch (e: any) {
          setMsg(e?.message || 'No se pudo completar el intercambio de código.')
        }
      }

      // 3) Flujo legado: #access_token=...&refresh_token=...
      if (!sessionOK) {
        const toks = parseHashTokens()
        if (toks) {
          try {
            const { error } = await supabase.auth.setSession({
              access_token: toks.access_token,
              refresh_token: toks.refresh_token,
            })
            if (error) throw error
            // Limpia el hash feo de la URL
            if (typeof window !== 'undefined') {
              history.replaceState(null, '', window.location.pathname + window.location.search)
            }
            sessionOK = true
          } catch (e: any) {
            setMsg(e?.message || 'No se pudo establecer la sesión desde el hash de la URL.')
          }
        }
      }

      if (!sessionOK) {
        setMsg('No se encontró código ni tokens de sesión válidos.')
        return
      }

      // 4) Sincroniza cookies httpOnly del servidor (tu /api/auth)
      await syncServerCookies()

      // 5) Redirige igual que tu login: por ?redirect o por rol
      const dest = await pickDestination(qp.get('redirect'))
      router.replace(dest)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 inline-flex items-center gap-2 text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" />
      {msg}
    </div>
  )
}
