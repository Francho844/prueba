// app/api/auth/sync/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { access_token, refresh_token } = await req.json().catch(() => ({}))
    const jar = cookies()
    const isProd = process.env.NODE_ENV === 'production'

    const base = {
      httpOnly: true as const,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',               // host-only: sirve en localhost y previews
    }

    // Si no viene nada -> limpiar ambas
    if (!access_token && !refresh_token) {
      jar.delete('sb-access-token')
      jar.delete('sb-refresh-token')
      return NextResponse.json(
        { ok: true, cleared: true },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Setear SOLO lo que venga (no fallar si falta uno)
    if (typeof access_token === 'string' && access_token.length > 0) {
      jar.set('sb-access-token', access_token, { ...base, maxAge: 60 * 60 }) // ~1h
    }
    if (typeof refresh_token === 'string' && refresh_token.length > 0) {
      jar.set('sb-refresh-token', refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 }) // ~30d
    }

    // Diagnóstico: verificar lo que quedó realmente en el jar
    const wroteAccess  = !!jar.get('sb-access-token')?.value
    const wroteRefresh = !!jar.get('sb-refresh-token')?.value

    return NextResponse.json(
      {
        ok: true,
        gotAccess:  !!access_token,
        gotRefresh: !!refresh_token,
        wroteAccess,
        wroteRefresh,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'bad_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
