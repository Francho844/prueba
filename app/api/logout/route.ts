import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const c = await cookies()
  const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 }
  c.set('sb-access-token', '', opts)
  c.set('sb-refresh-token', '', opts)
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const c = await cookies()
  const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 }
  c.set('sb-access-token', '', opts)
  c.set('sb-refresh-token', '', opts)
  return NextResponse.json({ ok: true })
}
