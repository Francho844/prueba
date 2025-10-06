'use client'
import { useEffect, useState } from 'react'
import RequireRoleClient from '../../../components/RequireRoleClient'
import { supabase } from '../../../lib/supabase'

export default function NotasPage({ searchParams }: { searchParams: { subject_id?: string } }) {
  const subjectId = Number(searchParams?.subject_id || 0)
  const [subjectName, setSubjectName] = useState<string>('—')

  useEffect(() => {
    (async () => {
      if (!subjectId) return
      const { data } = await supabase.from('subjects').select('name').eq('id', subjectId).maybeSingle()
      if (data?.name) setSubjectName(data.name)
    })()
  }, [subjectId])

  return (
    <RequireRoleClient role="teacher">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Notas — {subjectName}</h2>
        <a href="/teacher" className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          ← Volver
        </a>
      </div>

      <div className="rounded border bg-white p-4">
        <p className="text-slate-600">
          Aquí construiremos plan de evaluaciones y carga de notas. Las RLS ya limitan a tus ramos.
        </p>
      </div>
    </RequireRoleClient>
  )
}
