'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LogoutPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const redirect = sp.get('redirect') || '/login'
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function run() {
      try {
        await supabase.auth.signOut().catch(() => {})
        await fetch('/api/logout', { method: 'POST' }).catch(() => {})
        if (!mounted) return
        setDone(true)
        router.replace(redirect)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Error al cerrar sesión')
      }
    }
    run()
    return () => { mounted = false }
  }, [router, redirect])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <h1 className="text-2xl font-semibold">Cerrando sesión…</h1>
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <p className="text-sm text-gray-600">{done ? 'Listo. Redirigiendo…' : 'Un momento por favor…'}</p>
        )}
      </div>
    </div>
  )
}
