'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getMyRoles } from '../lib/roles'

export default function RequireRoleClient({ role, children }: { role: 'admin' | 'teacher'; children: React.ReactNode }) {
  const router = useRouter()
  const [ok, setOk] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return }
      const roles = await getMyRoles()
      if (!roles.includes(role)) {
        // si no tiene el rol, redirige a home o a /admin si corresponde
        if (roles.includes('admin')) router.replace('/admin')
        else router.replace('/')
        return
      }
      setOk(true)
      setChecking(false)
    })()
  }, [role, router])

  if (checking) return <div className="p-6 text-slate-600">Verificando permisos…</div>
  if (!ok) return null

  return <>{children}</>
}
