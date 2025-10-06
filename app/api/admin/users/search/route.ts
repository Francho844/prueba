import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ ok: true, items: [] })

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('id, first_name, last_name, email')
    .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(30)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const items = (data ?? []).map(u => ({
    id: u.id,
    email: u.email,
    name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.replace(/\s+/g, ' ').trim(),
  })).sort((a,b) => (a.name || a.email).localeCompare(b.name || b.email, 'es'))

  return NextResponse.json({ ok: true, items })
}
