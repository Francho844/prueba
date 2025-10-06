// app/estudiante/notas/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface ApiResp {
  ok: boolean
  error?: string
  student?: { id: string; first_name: string; last_name: string; run: string | null }
  course?: { id: number; name: string; code?: string | null } | null
  school_year?: number
  subjects?: {
    id: number
    name: string
    code: string | null
    assessments: { id: number; name: string; date: string | null; weight: number | null; term: any; mark: number | null }[]
  }[]
}

function round1(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : NaN
}

function normTerm(t: any): 'S0' | 'S1' | 'S2' | null {
  if (t === 0 || t === '0' || t === 'S0' || t === 's0') return 'S0'
  if (t === 1 || t === '1' || t === 'S1' || t === 's1') return 'S1'
  if (t === 2 || t === '2' || t === 'S2' || t === 's2') return 'S2'
  return null
}

export default function NotasAlumnoPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResp | null>(null)
  const [open, setOpen] = useState<Record<number, boolean>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/estudiante/notas', { cache: 'no-store' })
      const json: ApiResp = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      const o: Record<number, boolean> = {}
      for (const s of json.subjects || []) o[s.id] = true
      setOpen(o)
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las notas')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mis notas</h1>
        <p className="text-sm text-slate-600">
          {data?.course ? `${data.course.name}${data.course.code ? ` (${data.course.code})` : ''}` : '—'} · Año{' '}
          {data?.school_year ?? '—'}
        </p>
      </div>

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">Error: {error}</div>
      ) : !data?.subjects?.length ? (
        <div className="rounded-md border bg-white p-4 text-slate-600">
          No se encontraron asignaturas o evaluaciones para tu curso.
        </div>
      ) : (
        <div className="space-y-4">
          {data.subjects!.map((sub) => {
            // cálculos S1/S2/Final para esta asignatura
            const s1Marks: number[] = []
            const s2Marks: number[] = []
            for (const a of sub.assessments) {
              const m = a.mark
              const t = normTerm(a.term)
              if (m != null && Number.isFinite(m)) {
                if (t === 'S1') s1Marks.push(m)
                else if (t === 'S2') s2Marks.push(m)
              }
            }
            const s1 = s1Marks.length ? round1(s1Marks.reduce((a, b) => a + b, 0) / s1Marks.length) : NaN
            const s2 = s2Marks.length ? round1(s2Marks.reduce((a, b) => a + b, 0) / s2Marks.length) : NaN
            let fin = NaN
            const h1 = Number.isFinite(s1)
            const h2 = Number.isFinite(s2)
            if (h1 && h2) fin = round1(((s1 as number) + (s2 as number)) / 2)
            else if (h1) fin = s1 as number
            else if (h2) fin = s2 as number

            const isOpen = !!open[sub.id]

            return (
              <div key={sub.id} className="overflow-hidden rounded-2xl border bg-white">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [sub.id]: !o[sub.id] }))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{sub.name}</div>
                    {sub.code && <div className="text-xs text-slate-500">({sub.code})</div>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-slate-600">
                      S1: <span className="font-medium">{Number.isFinite(s1) ? s1.toFixed(1) : '—'}</span>
                    </div>
                    <div className="text-slate-600">
                      S2: <span className="font-medium">{Number.isFinite(s2) ? s2.toFixed(1) : '—'}</span>
                    </div>
                    <div className="font-semibold">
                      Final: <span>{Number.isFinite(fin) ? fin.toFixed(1) : '—'}</span>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3 overflow-auto">
                    {!sub.assessments.length ? (
                      <div className="text-sm text-slate-500">Sin evaluaciones registradas.</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="text-left py-2 px-2">Evaluación</th>
                            <th className="text-left py-2 px-2">Fecha</th>
                            <th className="text-left py-2 px-2">Término</th>
                            <th className="text-left py-2 px-2">Peso</th>
                            <th className="text-left py-2 px-2">Nota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sub.assessments.map((a) => (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="py-2 px-2">{a.name}</td>
                              <td className="py-2 px-2 whitespace-nowrap">{a.date || '—'}</td>
                              <td className="py-2 px-2">{normTerm(a.term) || '—'}</td>
                              <td className="py-2 px-2">{a.weight != null ? a.weight : '—'}</td>
                              <td className="py-2 px-2 font-medium">
                                {a.mark != null ? a.mark.toFixed(1) : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td className="py-2 px-2 text-slate-600" colSpan={3}>
                              Promedios
                            </td>
                            <td className="py-2 px-2 font-medium">S1 / S2</td>
                            <td className="py-2 px-2 font-semibold">
                              {Number.isFinite(s1) ? s1.toFixed(1) : '—'} /{' '}
                              {Number.isFinite(s2) ? s2.toFixed(1) : '—'}
                              <span className="ml-3 text-slate-600">
                                Final: <strong>{Number.isFinite(fin) ? fin.toFixed(1) : '—'}</strong>
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
