'use client'

import { useState } from 'react'
import Papa from 'papaparse'

type Row = {
  run: string
  first_name: string
  last_name: string
  birth_date?: string
  gender?: string
  address?: string
  phone?: string
  nationality?: string
  email_apoderado?: string
  run_apoderado: string
  apoderado_nombre?: string
  apoderado_apellido?: string
  apoderado_telefono?: string
  apoderado_relacion?: string
  curso_code: string
  school_year: number | string
}

const REQUIRED = [
  'run',
  'first_name',
  'last_name',
  'run_apoderado',
  'curso_code',
  'school_year',
] as const

export default function ImportStudentsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Row[]>([])

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null)
    setResults(null)
    setError(null)
    setPreview([])
  }

  function normalizeDate(s: string | undefined) {
    if (!s) return s
    const t = s.trim()
    if (!t) return undefined
    // Ya viene YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return t
    // Soporta D/M/YYYY o D-M-YYYY
    const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (m) {
      const [, d, mo, y] = m
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    return t
  }

  async function parseCsv(): Promise<Row[]> {
    return new Promise((resolve, reject) => {
      if (!file) return resolve([])
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: '', // autodetecta , ; \t
        transformHeader: (h) => h.trim(),
        complete: (res) => {
          const rows = (res.data as any[]).map((r) => {
            const o: any = {}
            for (const k in r) {
              const key = k?.trim()
              const val = typeof r[k] === 'string' ? r[k].trim() : r[k]
              if (key) o[key] = val
            }
            // normalizaciones mínimas
            if (typeof o.school_year === 'string' && o.school_year) {
              o.school_year = Number(o.school_year)
            }
            if (typeof o.birth_date === 'string') {
              o.birth_date = normalizeDate(o.birth_date)
            }
            // RUTs: dejamos tal cual; el backend normaliza y valida (incluye K/k)
            return o as Row
          })
          resolve(rows)
        },
        error: reject,
      })
    })
  }

  async function onImport() {
    try {
      setParsing(true)
      setError(null)
      const rows = await parseCsv()
      setParsing(false)

      if (!rows.length) {
        setError('El CSV no contiene filas.')
        return
      }

      // Validar encabezados mínimos
      const head = rows[0] as any
      const missing = REQUIRED.filter((c) => !(c in head))
      if (missing.length) {
        setError('Faltan columnas obligatorias en el CSV: ' + missing.join(', '))
        return
      }

      // Previsualización corta
      setPreview(rows.slice(0, 5))

      // Enviar al endpoint
      setSending(true)
      const res = await fetch('/api/admin/import/students', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      setSending(false)

      if (!res.ok) {
        setError(json?.error || 'Fallo en importación')
        setResults(null)
        return
      }

      setResults(json?.results || [])
    } catch (e: any) {
      setParsing(false)
      setSending(false)
      setError(e?.message || String(e))
    }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Importar alumnos (CSV)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Encabezados requeridos: <code>run, first_name, last_name, run_apoderado, curso_code, school_year</code>. Opcionales: <code>birth_date (YYYY-MM-DD), gender, address, phone, nationality, email_apoderado, apoderado_nombre, apoderado_apellido, apoderado_telefono, apoderado_relacion</code>.
      </p>

      <div className="space-y-3">
        <input type="file" accept=".csv,text/csv" onChange={pickFile} />
        <button
          className="rounded bg-slate-800 text-white px-3 py-2 disabled:opacity-60"
          onClick={onImport}
          disabled={!file || parsing || sending}
        >
          {parsing ? 'Procesando CSV…' : sending ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded border border-rose-300 bg-rose-50 p-3 text-rose-700">
          Error: {error}
        </div>
      )}

      {!!preview.length && (
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Vista previa (primeras 5 filas)</h2>
          <pre className="text-xs bg-slate-50 p-3 rounded border overflow-x-auto">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}

      {Array.isArray(results) && (
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Resultado por fila</h2>
          {results.length === 0 ? (
            <p className="text-slate-600">Sin resultados devueltos.</p>
          ) : (
            <pre className="text-xs bg-slate-50 p-3 rounded border overflow-x-auto">
              {JSON.stringify(results, null, 2)}
            </pre>
          )}
        </div>
      )}
    </main>
  )
}
