// app/api/admin/students/export/route.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function toCsvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // escapado CSV básico
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: any[], columns: { key: string; header: string }[]): string {
  const header = columns.map(c => toCsvCell(c.header)).join(',')
  const lines = rows.map(r => columns.map(c => toCsvCell(r[c.key])).join(','))
  return [header, ...lines].join('\n')
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const idsParam = (url.searchParams.get('ids') || '').trim() // coma-separados opcional

    // 1) Construir query base
    let query = supabaseAdmin
      .from('students')
      .select('id, run, first_name, last_name, birth_date, gender, address, phone, nationality, created_at')
      .order('last_name', { ascending: true })
      .limit(50000) // tope de seguridad

    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,run.ilike.%${q}%`)
    }

    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length > 0) query = query.in('id', ids)
    }

    const { data, error } = await query
    if (error) {
      return new Response(`error: ${error.message}`, { status: 500 })
    }

    const rows = (data ?? []).map(s => ({
      id: s.id,
      run: s.run,
      first_name: s.first_name,
      last_name: s.last_name,
      birth_date: s.birth_date ?? '',
      gender: s.gender ?? '',
      address: s.address ?? '',
      phone: s.phone ?? '',
      nationality: s.nationality ?? '',
      created_at: s.created_at ?? '',
    }))

    const columns = [
      { key: 'id', header: 'id' },
      { key: 'run', header: 'run' },
      { key: 'first_name', header: 'first_name' },
      { key: 'last_name', header: 'last_name' },
      { key: 'birth_date', header: 'birth_date' },
      { key: 'gender', header: 'gender' },
      { key: 'address', header: 'address' },
      { key: 'phone', header: 'phone' },
      { key: 'nationality', header: 'nationality' },
      { key: 'created_at', header: 'created_at' },
    ] as const

    const csv = toCsv(rows, columns as any)

    const now = new Date()
    const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
    const filename = `students_export_${stamp}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e: any) {
    return new Response(`error: ${e?.message || 'unknown'}`, { status: 500 })
  }
}
