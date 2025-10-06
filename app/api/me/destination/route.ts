// app/api/me/destination/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function bearerFrom(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}
function isSafePath(p?: string | null) {
  return !!p && p.startsWith('/') && !p.startsWith('//')
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const redirect = searchParams.get('redirect')
  const debug = searchParams.get('debug') === '1'
  let userId = searchParams.get('userId') || undefined

  try {
    // 0) Validar ENV
    const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    if (!URL || !SRK) {
      const err = 'Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE'
      return NextResponse.json(
        debug ? { dest: '/estudiante', error: err } : { dest: '/estudiante' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    const supa = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } })

    // 1) Respeta redirect seguro si viene del cliente
    if (isSafePath(redirect)) {
      return NextResponse.json({ dest: redirect }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // 2) Resolver userId si no vino en query (cookies httpOnly o Authorization: Bearer)
    if (!userId) {
      const jar = cookies()
      const token = jar.get('sb-access-token')?.value || bearerFrom(req)
      if (token) {
        const { data, error } = await supa.auth.getUser(token)
        if (!error && data?.user?.id) userId = data.user.id
      }
    }
    if (!userId) {
      return NextResponse.json(
        debug ? { dest: '/login', error: 'No userId' } : { dest: '/login' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // 3) IDs de rol del usuario
    const { data: urRows, error: urErr } = await supa
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)

    if (urErr) {
      return NextResponse.json(
        debug ? { dest: '/estudiante', error: `user_roles: ${urErr.message}` } : { dest: '/estudiante' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const roleIds = (urRows ?? []).map((r: any) => r?.role_id).filter(Boolean)

    // 4) Códigos desde roles (solo code/name; tu tabla no tiene slug)
    let codes: string[] = []
    if (roleIds.length) {
      const { data: roleRows, error: rErr } = await supa
        .from('roles')
        .select('code, name')
        .in('id', roleIds)

      if (rErr) {
        return NextResponse.json(
          debug ? { dest: '/estudiante', error: `roles: ${rErr.message}` } : { dest: '/estudiante' },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      }

      codes = (roleRows ?? [])
        .map((r: any) => String(r?.code ?? r?.name ?? '').toLowerCase().trim())
        .filter(Boolean)
    }

    // 5) Normalizar y decidir destino
    const adminLike   = new Set(['admin', 'administrator', 'administrador', 'superadmin', 'super_admin', 'root'])
    const teacherLike = new Set(['teacher', 'profesor', 'docente', 'teachers'])
    const studentLike = new Set(['student', 'estudiante', 'alumno', 'students'])
    const has = (set: Set<string>) => codes.some(c => set.has(c))

    const dest =
      has(adminLike)   ? '/admin'      :
      has(teacherLike) ? '/teacher'    :
      has(studentLike) ? '/estudiante' :
                         '/estudiante'

    return NextResponse.json(
      debug ? { dest, codes, roleIds } : { dest },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      debug ? { dest: '/estudiante', error: e?.message ?? 'unknown_error' } : { dest: '/estudiante' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
