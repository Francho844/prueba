// app/api/me/destination/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supa = createClient(URL, SRK)

function bearerFrom(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export async function GET(req: Request) {
  try {
    const jar = cookies()
    const raw = jar.get('sb-access-token')?.value || bearerFrom(req)
    if (!raw) return NextResponse.json({ dest: '/login' }, { status: 200 })

    // Decodifica el JWT para sacar el sub (user_id) sin validar firma (suficiente para lookup propio)
    const payload = JSON.parse(Buffer.from(raw.split('.')[1], 'base64').toString('utf8'))
    const userId: string | undefined = payload?.sub
    if (!userId) return NextResponse.json({ dest: '/login' }, { status: 200 })

    // Busca roles del usuario
    const { data: rows, error } = await supa
      .from('user_roles')
      .select('roles:role_id(code)')
      .eq('user_id', userId)

    if (error) {
      // Si algo falla, mejor no romper el login
      return NextResponse.json({ dest: '/dashboard' }, { status: 200 })
    }

    const codes = (rows || [])
      .map((r: any) => String(r?.roles?.code || '').toLowerCase().trim())
      .filter(Boolean)

    const isAdmin = codes.includes('admin')
    const teacherLike = new Set(['teacher','profesor','docente','teachers'])
    const isTeacher = codes.some(c => teacherLike.has(c))
    const isStudent = codes.includes('student') || codes.includes('estudiante')

    const dest = isAdmin ? '/admin'
      : isTeacher ? '/teacher'
      : isStudent ? '/estudiante'
      : '/dashboard'

    return NextResponse.json({ dest })
  } catch {
    return NextResponse.json({ dest: '/dashboard' }, { status: 200 })
  }
}
