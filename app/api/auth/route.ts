import { NextResponse } from 'next/server'

// Persiste tokens de Supabase en cookies HTTP-only para que el middleware/SSR vea la sesión.
export async function POST(req: Request) {
  try {
    const { access_token, refresh_token } = await req.json()
    if (!access_token || !refresh_token) {
      return NextResponse.json({ ok: false, error: 'Faltan tokens' }, { status: 400 })
    }

    const secure = process.env.NODE_ENV === 'production'
    const res = NextResponse.json({ ok: true })
    const baseOpts = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
    }

    res.cookies.set('sb-access-token', access_token, { ...baseOpts })
    res.cookies.set('sb-refresh-token', refresh_token, { ...baseOpts, maxAge: 60 * 60 * 24 * 7 })

    return res
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
