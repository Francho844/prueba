// app/api/admin/import/students/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : []

    // Logs útiles en server (verás en la consola del dev server / Vercel logs)
    console.log('[IMPORT] rows.length =', rows.length)
    if (rows[0]) {
      console.log('[IMPORT] first row keys =', Object.keys(rows[0]))
    }

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, results: [], error: 'No rows (body.rows vacío)' },
        { status: 400 }
      )
    }

    // RPC de eco (opcional, ayuda a depurar si PostgREST recibe el payload)
    const echo = await supabaseAdmin.rpc('import_students_echo', { payload: rows })
    if (echo.error) {
      return NextResponse.json(
        { ok: false, results: [], error: 'Echo RPC: ' + echo.error.message },
        { status: 500 }
      )
    }
    console.log('[IMPORT] echo received_count =', echo.data)

    // Llamada real
    const { data, error } = await supabaseAdmin.rpc('import_students_json', { payload: rows })
    if (error) {
      return NextResponse.json(
        { ok: false, results: [], error: error.message },
        { status: 500 }
      )
    }

    const results = (data || []).map((r: any) => ({
      index: r.index,
      ok: r.ok,
      errors: r.errors || []
    }))

    return NextResponse.json({
      ok: results.every(r => r.ok),
      count: results.length,
      results
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Unhandled error' },
      { status: 500 }
    )
  }
}
