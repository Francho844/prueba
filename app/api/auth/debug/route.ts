// app/api/auth/debug/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const jar = cookies()
  const hasAccess = !!jar.get('sb-access-token')?.value
  const hasRefresh = !!jar.get('sb-refresh-token')?.value
  return NextResponse.json({ hasAccess, hasRefresh })
}
