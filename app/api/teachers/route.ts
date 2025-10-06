// app/api/teachers/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()

    // 1) Intento con role_code (si existe)
    try {
      let query = supabaseAdmin
        .from('app_users')
        .select('id, first_name, last_name, email, role_code', { count: 'exact' })
        .eq('role_code', 'teacher')

      if (q) {
        // Búsqueda simple por ilike en nombre/apellido/email
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      }

      const { data, error } = await query.order('last_name', { ascending: true }).order('first_name', { ascending: true })

      if (error) throw error

      return NextResponse.json({ ok: true, items: data ?? [] })
    } catch (e: any) {
      // 2) Fallback: no hay role_code o falló el filtro → devolver todos (con búsqueda si hay q)
      let query = supabaseAdmin
        .from('app_users')
        .select('id, first_name, last_name, email', { count: 'exact' })

      if (q) {
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      }

      const { data, error } = await query.order('last_name', { ascending: true }).order('first_name', { ascending: true })
      if (error) throw error

      return NextResponse.json({ ok: true, items: data ?? [] })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
