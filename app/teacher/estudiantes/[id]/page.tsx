'use client'

import { useEffect, useState } from 'react'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'

/* ========= Tipos ========= */
type Student = {
  id: string
  run: string | null
  first_name: string
  last_name: string
  birthdate: string | null
  gender: string | null
  address: string | null
  phone: string | null
  nationality: string | null
  photo_url: string | null
  created_at: string | null
}

type Guardian = {
  id: string
  run: string | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  relationship: string | null
  occupation: string | null
}

type StudentGuardian = {
  student_id: string
  guardian_id: string
  role: string | null
  guardians?: Guardian | null
}

type EnrollmentForm = {
  id: number
  student_id: string
  course_id: number | null
  school_year: number
  admission_number: string | null
  admission_date: string | null
  elective_subject_id?: number | null
  created_at: string | null
}

/* ========= Helpers presentación ========= */
function t(s?: string | null) { return (s ?? '').trim() }
function fullName(st?: Pick<Student,'first_name'|'last_name'> | null) {
  return `${t(st?.first_name)} ${t(st?.last_name)}`.trim()
}
function formatRUN(run?: string | null) {
  if (!run) return '—'
  // Deja solo dígitos y K/k; luego arma miles y agrega DV
  const raw = String(run).replace(/[^0-9kK]/g, '').toUpperCase()
  if (raw.length < 2) return raw || '—'
  const dv = raw.slice(-1)
  const num = raw.slice(0, -1)
  let out = ''
  for (let i = num.length; i > 0; i -= 3) {
    const start = Math.max(i - 3, 0)
    const chunk = num.slice(start, i)
    out = out ? `${chunk}.${out}` : chunk
  }
  return `${out}-${dv}`
}
function formatDateISO(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso); if (isNaN(+d)) return '—'
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}
function formatToday() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/* ========= Página (solo lectura para docentes) ========= */
export default function FichaAlumnoDocentePage({ params }: { params: { id: string } }) {
  const { id } = params

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [st, setSt] = useState<Student | null>(null)
  const [sg, setSg] = useState<StudentGuardian[]>([])
  const [enroll, setEnroll] = useState<EnrollmentForm | null>(null)
  const [courseName, setCourseName] = useState('—')
  const [electiveName, setElectiveName] = useState('—')

  useEffect(() => {
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`/api/teacher/estudiantes/${id}`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) {
          const text = await res.text()
          throw new Error(`La API no retornó JSON (status ${res.status}). ${text.slice(0,180)}`)
        }
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)

        setSt(json.student as Student)
        setSg((json.student_guardians || []) as StudentGuardian[])
        setEnroll((json.enrollment || null) as EnrollmentForm | null)
        setCourseName(json.courseName || '—')
        setElectiveName(json.electiveName || '—')
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading) {
    return (
      <div className="p-6 text-slate-600 inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha…
      </div>
    )
  }

  if (!st) {
    return (
      <div className="p-6">
        <div className="text-rose-700 font-medium">{error || 'Alumno no existe o no tienes permiso para verlo.'}</div>
        <div className="mt-2 text-sm text-slate-600">ID: {id}</div>
        <div className="mt-4">
          <button
            onClick={() => (window.location.href = '/teacher/jefatura')}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Jefatura
          </button>
        </div>
      </div>
    )
  }

  const titular = sg.find(x => (x.role || '').toLowerCase() === 'titular')?.guardians || null
  const suplente = sg.find(x => (x.role || '').toLowerCase() === 'suplente')?.guardians || null

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Cabecera */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src="/img/logo.png" alt="Logo" className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold">Ficha del Alumno</h1>
            <p className="text-sm text-slate-600">Saint Thomas Valparaíso</p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={() => (window.location.href = '/teacher/jefatura')}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Jefatura
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded bg-fuchsia-700 px-3 py-2 text-sm font-medium text-white hover:bg-fuchsia-800"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Encabezado secundario */}
      <div className="mb-3 text-right text-sm text-slate-600">
        <div><strong>Fecha:</strong> {formatToday()}</div>
        <div><strong>ID:</strong> {st.id}</div>
      </div>

      {/* Ficha (solo lectura) */}
      <div id="ficha" className="rounded-lg border bg-white p-6">
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Alumno</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>RUN:</strong> {formatRUN(st.run)}</div>
              <div><strong>Nombre:</strong> {fullName(st)}</div>
              <div><strong>Nacimiento:</strong> {formatDateISO(st.birthdate)}</div>
              <div><strong>Género:</strong> {st.gender || '—'}</div>
              <div><strong>Nacionalidad:</strong> {st.nationality || '—'}</div>
              <div><strong>Dirección:</strong> {st.address || '—'}</div>
              <div><strong>Teléfono:</strong> {st.phone || '—'}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Foto</div>
            <div className="mt-1 flex items-center justify-center rounded border p-2">
              {st.photo_url ? (
                <img src={st.photo_url} alt="Alumno" className="h-40 w-40 object-cover" />
              ) : (
                <div className="h-40 w-40 bg-slate-100" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Apoderado titular</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>Nombre:</strong> {titular ? `${t(titular.first_name)} ${t(titular.last_name)}` : '—'}</div>
              <div><strong>RUN:</strong> {formatRUN(titular?.run ?? null)}</div>
              <div><strong>Teléfono:</strong> {titular?.phone || '—'}</div>
              <div><strong>Email:</strong> {titular?.email || '—'}</div>
              <div><strong>Ocupación:</strong> {titular?.occupation || '—'}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Apoderado suplente</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>Nombre:</strong> {suplente ? `${t(suplente.first_name)} ${t(suplente.last_name)}` : '—'}</div>
              <div><strong>RUN:</strong> {formatRUN(suplente?.run ?? null)}</div>
              <div><strong>Teléfono:</strong> {suplente?.phone || '—'}</div>
              <div><strong>Email:</strong> {suplente?.email || '—'}</div>
              <div><strong>Ocupación:</strong> {suplente?.occupation || '—'}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Matrícula</div>
          <div className="mt-1 rounded border p-3">
            <div><strong>Año escolar:</strong> {enroll?.school_year ?? '—'}</div>
            <div><strong>Curso:</strong> {courseName}</div>
            <div><strong>Electivo:</strong> {electiveName}</div>
            <div><strong>N° de admisión:</strong> {enroll?.admission_number || '—'}</div>
            <div><strong>Fecha de admisión:</strong> {formatDateISO(enroll?.admission_date || null)}</div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          * Vista para docentes en modo lectura. Para actualizar datos, contacte a Administración.
        </div>
      </div>

      {/* Estilos de impresión */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          #ficha { box-shadow: none !important; border-color: #e5e7eb; }
        }
      `}</style>
    </div>
  )
}
