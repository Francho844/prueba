'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import SelectCourse from '../../../components/SelectCourse'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/** Utilidades RUN/RUT */
function cleanRut(rut: string) {
  return rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
}
function formatRut(rut: string) {
  const c = cleanRut(rut)
  if (c.length < 2) return rut
  const body = c.slice(0, -1)
  const dv = c.slice(-1)
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv
}
function isValidRut(rut: string) {
  const c = cleanRut(rut)
  if (!/^[0-9]+[0-9K]$/.test(c)) return false
  const body = c.slice(0, -1)
  const dv = c.slice(-1)
  let sum = 0, mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (sum % 11)
  const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return dvCalc === dv
}

/** Helper: convertir imagen de /public a DataURL */
async function loadImageAsDataURL(path: string) {
  const res = await fetch(path)
  const blob = await res.blob()
  return await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

// Si AÚN no corriste el SQL, deja esto en false. Ponlo en true cuando agregues columnas nuevas.
const HAS_EXTRA_ENROLLMENT_COLS = true;

export default function FichaMatriculaPage() {
  const search = useSearchParams()
  const courseIdParam = search.get('courseId')
  const courseId = courseIdParam ? Number(courseIdParam) : null
  const schoolYearParam = search.get('schoolYear')
  const [schoolYear, setSchoolYear] = useState<number>(
    schoolYearParam ? Number(schoolYearParam) : new Date().getFullYear()
  )

  if (!courseId) {
    return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Botones al inicio */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (window.location.href = '/admin/anios')}
          className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
        >
          Años escolares
        </button>
        <button
          type="button"
          onClick={() => (window.location.href = '/admin')}
          className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
        >
          ← Menú principal
        </button>
      </div>
        <div className="mx-auto max-w-3xl p-4">
        <h1 className="mb-3 text-xl font-bold">Ficha de matrícula</h1>
        <p className="mb-4 text-gray-600">Selecciona un curso para continuar con la matrícula del estudiante.</p>
        <SelectCourse targetPath="/matriculas/ficha" />
      </div>
    </div>
  )
}
   
  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="mb-3 text-xl font-bold">Ficha de matrícula</h1>
      <p className="mb-4 text-gray-600">
        Curso ID: <b>{courseId}</b> — Año: <b>{schoolYear}</b>
      </p>
      <FichaForm courseId={courseId} schoolYear={schoolYear} onChangeYear={setSchoolYear} />
    </div>
  )
}

/** Formulario + PDF */
function FichaForm({
  courseId,
  schoolYear,
  onChangeYear,
}: {
  courseId: number
  schoolYear: number
  onChangeYear: (y: number) => void
}) {
  const printRef = useRef<HTMLDivElement>(null)

  // MATRÍCULA (al inicio)
  const [admissionNumber, setAdmissionNumber] = useState('')
  const [admissionDate, setAdmissionDate] = useState<string>(() => new Date().toISOString().slice(0, 10))

  // ESTUDIANTE
  const [run, setRun] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [nationality, setNationality] = useState('')
  const [healthCondition, setHealthCondition] = useState('')            // Enfermedad
  const [previousSchool, setPreviousSchool] = useState('')              // Colegio de procedencia
  const [livesWith, setLivesWith] = useState('')                        // Alumno vive con
  const [repetition, setRepetition] = useState<'no' | 'si'>('no')       // Repitencia
  const [fatherEducation, setFatherEducation] = useState('')            // Nivel educ. padre
  const [motherEducation, setMotherEducation] = useState('')            // Nivel educ. madre
  const [mediaOption, setMediaOption] = useState<'artes' | 'musica' | ''>('') // Media: Artes/Música

  // APODERADO TITULAR
  const [gFirstName, setGFirstName] = useState('')
  const [gLastName, setGLastName] = useState('')
  const [gPhone, setGPhone] = useState('')
  const [gEmail, setGEmail] = useState('')
  const [gOccupation, setGOccupation] = useState('')                    // Ocupación
  const [gRelationship, setGRelationship] = useState('')                // Relación con el alumno

  // APODERADO SUPLENTE
  const [gsFirstName, setGsFirstName] = useState('')
  const [gsLastName, setGsLastName] = useState('')
  const [gsPhone, setGsPhone] = useState('')
  const [gsEmail, setGsEmail] = useState('')
  const [gsOccupation, setGsOccupation] = useState('')
  const [gsRelationship, setGsRelationship] = useState('')

  // OTROS
  const [transportMode, setTransportMode] = useState('')
  const [observations, setObservations] = useState('')

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onSearchByRun() {
    setErr(null); setMsg(null)
    if (!run) { setErr('Ingrese un RUN'); return }
    const cleaned = cleanRut(run)
    if (!isValidRut(cleaned)) { setErr('RUN inválido'); return }
    setRun(formatRut(run))

    const { data: st } = await supabase
      .from('students')
      .select('*')
      .or(`run_clean.eq.${cleaned},run.eq.${cleaned}`)
      .limit(1)
      .maybeSingle()

    if (!st) { setMsg('No existe el estudiante. Se creará al guardar.'); return }

    setFirstName(st.first_name || '')
    setLastName(st.last_name || '')
    setAddress(st.address || '')
    setPhone(st.phone || '')
    setNationality(st.nationality || '')
    setMsg('Estudiante cargado desde la base.')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null)
    try {
      setLoading(true)
      if (!run) throw new Error('RUN requerido')
      const cleaned = cleanRut(run)
      if (!isValidRut(cleaned)) throw new Error('RUN inválido')

      // 1) Upsert estudiante
      let studentId: string | null = null
      {
        const { data: existing } = await supabase
          .from('students')
          .select('id')
          .or(`run_clean.eq.${cleaned},run.eq.${cleaned}`)
          .limit(1)
          .maybeSingle()

        if (existing?.id) {
          const { data, error } = await supabase
            .from('students')
            .update({
              run: cleaned, run_clean: cleaned,
              first_name: firstName.trim(), last_name: lastName.trim(),
              address: address || null, phone: phone || null, nationality: nationality || null,
            })
            .eq('id', existing.id)
            .select('id').maybeSingle()
          if (error) throw error
          studentId = data?.id ?? existing.id
        } else {
          const { data, error } = await supabase
            .from('students')
            .insert({
              run: cleaned, run_clean: cleaned,
              first_name: firstName.trim(), last_name: lastName.trim(),
              address: address || null, phone: phone || null, nationality: nationality || null,
            })
            .select('id').maybeSingle()
          if (error) throw error
          studentId = data?.id as string
        }
      }
      if (!studentId) throw new Error('No se pudo obtener el ID del estudiante')

      // 2) Upsert apoderado TITULAR
      let guardianId: string | null = null
      if (gFirstName || gLastName || gPhone || gEmail || gOccupation || gRelationship) {
        const { data: g } = await supabase
          .from('guardians').select('id')
          .eq('first_name', gFirstName.trim()).eq('last_name', gLastName.trim())
          .limit(1).maybeSingle()

        if (g?.id) {
          const { data, error } = await supabase
            .from('guardians')
            .update({
              first_name: gFirstName.trim(),
              last_name: gLastName.trim(),
              phone: gPhone || null,
              email: gEmail || null,
              occupation: gOccupation || null,
              relationship: gRelationship || null,
            }).eq('id', g.id).select('id').maybeSingle()
          if (error) throw error
          guardianId = data?.id ?? g.id
        } else {
          const { data, error } = await supabase
            .from('guardians')
            .insert({
              first_name: gFirstName.trim(),
              last_name: gLastName.trim(),
              phone: gPhone || null,
              email: gEmail || null,
              occupation: gOccupation || null,
              relationship: gRelationship || null,
            }).select('id').maybeSingle()
          if (error) throw error
          guardianId = data?.id as string
        }
        if (guardianId) {
          await supabase
            .from('student_guardians')
            .upsert({ student_id: studentId, guardian_id: guardianId, role: 'titular' },
                    { onConflict: 'student_id,guardian_id' })
        }
      }

      // 3) Upsert apoderado SUPLENTE
      let gsupId: string | null = null
      if (gsFirstName || gsLastName || gsPhone || gsEmail || gsOccupation || gsRelationship) {
        const { data: g } = await supabase
          .from('guardians').select('id')
          .eq('first_name', gsFirstName.trim()).eq('last_name', gsLastName.trim())
          .limit(1).maybeSingle()

        if (g?.id) {
          const { data, error } = await supabase
            .from('guardians')
            .update({
              first_name: gsFirstName.trim(),
              last_name: gsLastName.trim(),
              phone: gsPhone || null,
              email: gsEmail || null,
              occupation: gsOccupation || null,
              relationship: gsRelationship || null,
            }).eq('id', g.id).select('id').maybeSingle()
          if (error) throw error
          gsupId = data?.id ?? g.id
        } else {
          const { data, error } = await supabase
            .from('guardians')
            .insert({
              first_name: gsFirstName.trim(),
              last_name: gsLastName.trim(),
              phone: gsPhone || null,
              email: gsEmail || null,
              occupation: gsOccupation || null,
              relationship: gsRelationship || null,
            }).select('id').maybeSingle()
          if (error) throw error
          gsupId = data?.id as string
        }
        if (gsupId) {
          await supabase
            .from('student_guardians')
            .upsert({ student_id: studentId, guardian_id: gsupId, role: 'suplente' },
                    { onConflict: 'student_id,guardian_id' })
        }
      }

      // 4) Upsert enrollment_forms (con fallback si faltan columnas)
      const extra = {
        previous_school: previousSchool || null,
        lives_with: livesWith || null,
        repetition: repetition === 'si',
        father_education: fatherEducation || null,
        mother_education: motherEducation || null,
        media_option: mediaOption || null,
      }

      // Si no existen columnas nuevas, empaqueta en observations
      const packedExtras =
        `Enfermedad: ${healthCondition || '—'} | Procedencia: ${previousSchool || '—'} | ` +
        `Vive con: ${livesWith || '—'} | Repitencia: ${repetition} | ` +
        `Educ. Padre: ${fatherEducation || '—'} | Educ. Madre: ${motherEducation || '—'} | ` +
        `Media: ${mediaOption || '—'}`

      const baseForm: any = {
        student_id: studentId,
        course_id: courseId,
        school_year: schoolYear,
        admission_number: admissionNumber || null,
        admission_date: admissionDate || null,
        transport_mode: transportMode || null,
        observations: `${healthCondition ? `Enfermedad: ${healthCondition}. ` : ''}${observations || ''}`.trim(),
      }

      if (HAS_EXTRA_ENROLLMENT_COLS) {
        Object.assign(baseForm, extra)
      } else {
        baseForm.observations = `${baseForm.observations} ${packedExtras}`.trim()
      }

      {
        const { error } = await supabase.from('enrollment_forms').upsert(baseForm)
        if (error) throw error
      }

      // 5) Asegurar enrollments
      {
        const { error } = await supabase
          .from('enrollments')
          .upsert(
            {
              student_id: studentId,
              course_id: courseId,
              school_year: schoolYear,
              status: 'active',
              enrollment_date: admissionDate || null,
            },
            { onConflict: 'student_id,course_id,school_year' }
          )
        if (error) throw error
      }

      setMsg('Matrícula guardada correctamente.')
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  /** ===== PDF BONITO (jsPDF + autoTable) con logo ===== */
  async function generatePdfPretty() {
    const unit: 'in' = 'in'
    const pageWidth = 8.5
    const pageHeight = 13
    const margin = 0.5
    const pdf = new jsPDF({ unit, format: [pageWidth, pageHeight], orientation: 'portrait', compress: true })

    const titleColor: [number, number, number] = [20, 20, 20]
    const muted: [number, number, number] = [90, 90, 90]
    const borderColor: [number, number, number] = [180, 180, 180]
    let y = margin

    // Logo
    try {
      const logoDataUrl = await loadImageAsDataURL('/img/logo.png')
      pdf.addImage(logoDataUrl, 'PNG', margin, y, 0.9, 0.9)
    } catch {}

    // Encabezado
    pdf.setFontSize(12); pdf.setTextColor(...titleColor)
    pdf.text('COLEGIO SAINT THOMAS - VALPARAÍSO', pageWidth / 2, y + 0.25, { align: 'center' })
    pdf.setFontSize(10); pdf.setTextColor(...muted)
    pdf.text('FICHA DE MATRÍCULA', pageWidth / 2, y + 0.55, { align: 'center' })
    pdf.text(`Año escolar: ${schoolYear}`, pageWidth / 2, y + 0.85, { align: 'center' })
    y += 1.05
    pdf.setDrawColor(...borderColor); pdf.line(margin, y, pageWidth - margin, y); y += 0.2

    const tableWidth = pageWidth - margin * 2
    const labelColWidth = 2.2
    const valueColWidth = tableWidth - labelColWidth

    function section(title: string, rows: Array<[string, string]>) {
      pdf.setFontSize(10); pdf.setTextColor(...titleColor)
      pdf.text(title, margin, y); y += 0.14

      autoTable(pdf, {
        startY: y,
        theme: 'grid',
        tableWidth,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 1.5, lineColor: borderColor, textColor: [30, 30, 30], overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [245, 245, 245], textColor: [30, 30, 30], lineColor: borderColor, fontSize: 9 },
        columnStyles: { 0: { cellWidth: labelColWidth }, 1: { cellWidth: valueColWidth } },
        head: [['Campo', 'Valor']],
        body: rows.map(([k, v]) => [k, v || '—']),
      })
      // @ts-ignore
      y = (pdf as any).lastAutoTable.finalY + 0.25
    }

    // MATRÍCULA (primero)
    section('Matrícula', [
      ['Año escolar', String(schoolYear)],
      ['Nº Admisión', admissionNumber || '—'],
      ['Fecha admisión', admissionDate || '—'],
    ])

    // ESTUDIANTE
    section('Estudiante', [
      ['RUN', run],
      ['Nombres', firstName],
      ['Apellidos', lastName],
      ['Dirección', address],
      ['Teléfono', phone],
      ['Nacionalidad', nationality],
      ['Enfermedad', healthCondition],
      ['Colegio de procedencia', previousSchool],
      ['Vive con', livesWith],
      ['Repitencia', repetition === 'si' ? 'Sí' : 'No'],
      ['Educación del padre', fatherEducation],
      ['Educación de la madre', motherEducation],
      ['Opción Media', mediaOption ? (mediaOption === 'artes' ? 'Artes' : 'Música') : '—'],
    ])

    // APODERADO TITULAR
    section('Apoderado titular', [
      ['Nombres', gFirstName],
      ['Apellidos', gLastName],
      ['Teléfono', gPhone],
      ['Email', gEmail],
      ['Ocupación', gOccupation],
      ['Relación con el alumno', gRelationship],
    ])

    // APODERADO SUPLENTE
    section('Apoderado suplente', [
      ['Nombres', gsFirstName],
      ['Apellidos', gsLastName],
      ['Teléfono', gsPhone],
      ['Email', gsEmail],
      ['Ocupación', gsOccupation],
      ['Relación con el alumno', gsRelationship],
    ])

    // LEYENDA
    {
      const legend =
        'Yo, en calidad de apoderado titular y/o suplente del estudiante, declaro haber tomado conocimiento y aceptar los reglamentos internos, el proyecto educativo y el reglamento de convivencia escolar del establecimiento, disponibles en la página web www.sthomasc.cl y en las oficinas del colegio. Me comprometo a respetar y cumplir las normas, asistir regularmente a reuniones, mantenerme informado sobre la situación académica y formativa de mi hijo/a o pupilo/a, y notificar oportunamente cualquier situación relevante. Autorizo expresamente el uso de la imagen de mi hijo/a o pupilo/a en material institucional del colegio (folletos, página web, lienzos u otros), exclusivamente para fines educativos y de difusión. Asimismo, declaro comprender que, una vez completada la presente ficha, cualquier cambio de apoderado titular y/o suplente deberá ser solicitado por escrito y será evaluado individualmente por la Dirección, quien resolverá con la debida autorización expresa.'
      section('Declaración y autorización', [['', legend]])
    }

    // FIRMA APODERADO (al final)
    const signaturesTop = Math.min(y + 0.6, pageHeight - margin - 0.9)
    const colW = (pageWidth - margin * 2)
    const lineY = signaturesTop
    pdf.setDrawColor(...[150,150,150] as [number, number, number])
    pdf.line(margin + 0.5, lineY, margin + colW - 0.5, lineY)
    pdf.setFontSize(9); pdf.setTextColor(...[90,90,90] as [number, number, number])
    pdf.text('Firma Apoderado', margin + colW / 2, lineY + 0.18, { align: 'center' })

    // Pie
    pdf.setFontSize(8); pdf.setTextColor(...[90,90,90] as [number, number, number])
    pdf.text('Documento generado por SIGA – Saint Thomas • ' + new Date().toLocaleDateString(),
             pageWidth / 2, pageHeight - margin + 0.1, { align: 'center' })

    // Debe caber en 1 página con estos tamaños
    pdf.save(`ficha_matricula_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  /** ===== PDF captura (opcional) ===== */
  async function generatePdf() {
    if (!printRef.current) return
    const unit: 'in' = 'in'
    const pageWidth = 8.5
    const pageHeight = 13
    const margin = 0.5
    const node = printRef.current
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#fff', useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit, format: [pageWidth, pageHeight] })

    const printableWidth = pageWidth - margin * 2
    const printableHeight = pageHeight - margin * 2
    const imgWidthIn = canvas.width / 96
    const imgHeightIn = canvas.height / 96
    const imgRatio = imgWidthIn / imgHeightIn
    const boxRatio = printableWidth / printableHeight

    let renderW = printableWidth
    let renderH = printableHeight
    if (imgRatio > boxRatio) { renderW = printableWidth; renderH = renderW / imgRatio }
    else { renderH = printableHeight; renderW = renderH * imgRatio }

    const offsetX = margin + (printableWidth - renderW) / 2
    const offsetY = margin + (printableHeight - renderH) / 2

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST')
    pdf.save(`ficha_matricula_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <>
      {/* Botones */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={generatePdfPretty} className="rounded bg-emerald-600 px-4 py-2 text-white">
          Imprimir bonito (PDF nativo)
        </button>
        <button type="button" onClick={generatePdf} className="rounded bg-gray-800 px-4 py-2 text-white">
          Imprimir (captura del formulario)
        </button>
      </div>

      {/* FORMULARIO (incluye matrícula arriba) */}
      <form onSubmit={onSubmit} ref={printRef} className="space-y-6 bg-white p-4 rounded-xl border">
        {/* Mensajes */}
        {err && <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
        {msg && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

        {/* MATRÍCULA (al inicio) */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Datos de matrícula</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">Año escolar</label>
              <input type="number" className="mt-1 w-full rounded border px-3 py-2" value={schoolYear} onChange={(e) => onChangeYear(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium">Nº Admisión</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={admissionNumber} onChange={(e) => setAdmissionNumber(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Fecha admisión</label>
              <input type="date" className="mt-1 w-full rounded border px-3 py-2" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ESTUDIANTE */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Datos del estudiante</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium">RUN (RUT)</label>
              <div className="mt-1 flex gap-2">
                <input className="w-full rounded border px-3 py-2" value={run} onChange={(e) => setRun(e.target.value)} placeholder="12.345.678-9" required />
                <button type="button" onClick={onSearchByRun} className="rounded bg-gray-900 px-3 py-2 text-white">Buscar</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">Nombres</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium">Apellidos</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium">Dirección</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Teléfono</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Nacionalidad</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={nationality} onChange={(e) => setNationality(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium">Enfermedad</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={healthCondition} onChange={(e) => setHealthCondition(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Colegio de procedencia</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={previousSchool} onChange={(e) => setPreviousSchool(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Alumno vive con</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={livesWith} onChange={(e) => setLivesWith(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Repitencia</label>
              <select className="mt-1 w-full rounded border px-3 py-2" value={repetition} onChange={(e) => setRepetition(e.target.value as any)}>
                <option value="no">No</option>
                <option value="si">Sí</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Educación del padre</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={fatherEducation} onChange={(e) => setFatherEducation(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Educación de la madre</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={motherEducation} onChange={(e) => setMotherEducation(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium">Opción de Media</label>
              <div className="mt-2 flex gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="mediaOpt" checked={mediaOption === 'artes'} onChange={() => setMediaOption('artes')} />
                  Artes
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mediaOpt" checked={mediaOption === 'musica'} onChange={() => setMediaOption('musica')} />
                  Música
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* APODERADO TITULAR */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Apoderado titular</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Nombres</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gFirstName} onChange={(e) => setGFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Apellidos</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gLastName} onChange={(e) => setGLastName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Teléfono</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gPhone} onChange={(e) => setGPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" className="mt-1 w-full rounded border px-3 py-2" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Ocupación</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gOccupation} onChange={(e) => setGOccupation(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Relación con el alumno</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gRelationship} onChange={(e) => setGRelationship(e.target.value)} />
            </div>
          </div>
        </div>

        {/* APODERADO SUPLENTE */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Apoderado suplente</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Nombres</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gsFirstName} onChange={(e) => setGsFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Apellidos</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gsLastName} onChange={(e) => setGsLastName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Teléfono</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gsPhone} onChange={(e) => setGsPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" className="mt-1 w-full rounded border px-3 py-2" value={gsEmail} onChange={(e) => setGsEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Ocupación</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gsOccupation} onChange={(e) => setGsOccupation(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Relación con el alumno</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={gsRelationship} onChange={(e) => setGsRelationship(e.target.value)} />
            </div>
          </div>
        </div>

        {/* OTROS / OBSERVACIONES */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Otros</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Transporte</label>
              <input className="mt-1 w-full rounded border px-3 py-2" value={transportMode} onChange={(e) => setTransportMode(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium">Observaciones</label>
              <textarea className="mt-1 w-full rounded border px-3 py-2" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
            </div>
          </div>
        </div>

        {/* LEYENDA */}
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 font-semibold">Declaración y autorización</h3>
          <p className="text-sm leading-relaxed text-gray-700">
            Yo, en calidad de apoderado titular y/o suplente del estudiante, declaro haber tomado conocimiento y aceptar los
            reglamentos internos, el proyecto educativo y el reglamento de convivencia escolar del establecimiento, disponibles
            en la página web www.sthomasc.cl y en las oficinas del colegio. Me comprometo a respetar y cumplir las normas,
            asistir regularmente a reuniones, mantenerme informado sobre la situación académica y formativa de mi hijo/a o
            pupilo/a, y notificar oportunamente cualquier situación relevante. Autorizo expresamente el uso de la imagen de mi
            hijo/a o pupilo/a en material institucional del colegio (folletos, página web, lienzos u otros), exclusivamente para
            fines educativos y de difusión. Asimismo, declaro comprender que, una vez completada la presente ficha, cualquier
            cambio de apoderado titular y/o suplente deberá ser solicitado por escrito y será evaluado individualmente por la
            Dirección, quien resolverá con la debida autorización expresa.
          </p>
        </div>

        {/* ACCIONES */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="rounded bg-black px-4 py-2 text-white disabled:opacity-40">
            {loading ? 'Guardando…' : 'Guardar matrícula'}
          </button>
        </div>

        {/* FIRMA APODERADO */}
        <div className="pt-10">
          <div className="mx-auto max-w-md">
            <div className="h-px bg-gray-300" />
            <p className="mt-1 text-center text-sm text-gray-600">Firma Apoderado</p>
          </div>
        </div>
      </form>
    </>
  )
}
