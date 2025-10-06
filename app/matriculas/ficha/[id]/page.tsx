'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type EnrollmentForm = {
  id: number
  admission_number: string | null
  admission_date: string | null
  school_year: number
  student_id: string
  course_id: number
  transport_mode: string | null
  observations: string | null
  previous_school?: string | null
  lives_with?: string | null
  repetition?: boolean | null
  father_education?: string | null
  mother_education?: string | null
  media_option?: string | null
  students?: {
    run: string | null
    first_name: string | null
    last_name: string | null
    address?: string | null
    phone?: string | null
    nationality?: string | null
  } | null
  courses?: {
    name: string | null
    code?: string | null
  } | null
}

type Guardian = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  occupation?: string | null
  relationship?: string | null
}

async function loadImageAsDataURL(path: string) {
  const res = await fetch(path)
  const blob = await res.blob()
  return await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

export default function FichaMatriculaShowPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ficha, setFicha] = useState<EnrollmentForm | null>(null)
  const [titular, setTitular] = useState<Guardian | null>(null)
  const [suplente, setSuplente] = useState<Guardian | null>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        setLoading(true)
        setErr(null)

        // Ficha + joins
        const { data: ef, error } = await supabase
          .from('enrollment_forms')
          .select(`
            id, admission_number, admission_date, school_year,
            student_id, course_id, transport_mode, observations,
            previous_school, lives_with, repetition, father_education, mother_education, media_option,
            students ( run, first_name, last_name, address, phone, nationality ),
            courses ( name, code )
          `)
          .eq('id', Number(id))
          .maybeSingle()

        if (error) throw error
        if (!ef) throw new Error('Matrícula no encontrada')
        setFicha(ef as EnrollmentForm)

        // Apoderados por relación
        const studentId = ef.student_id
        if (studentId) {
          const { data: sg, error: gErr } = await supabase
            .from('student_guardians')
            .select(`
              role,
              guardians ( id, first_name, last_name, phone, email, occupation, relationship )
            `)
            .eq('student_id', studentId)

          if (gErr) throw gErr
          const tit = sg?.find(x => x.role === 'titular')?.guardians || null
          const sup = sg?.find(x => x.role === 'suplente')?.guardians || null
          setTitular(tit as any)
          setSuplente(sup as any)
        }
      } catch (e: any) {
        setErr(e.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function Row({ label, value }: { label: string; value?: string | null }) {
    return (
      <div className="grid grid-cols-12 items-start text-[13px]">
        <div className="col-span-4 pr-3 font-semibold text-slate-700">{label}</div>
        <div className="col-span-8 text-slate-900">{value || '—'}</div>
      </div>
    )
  }
  function twoCol(a: JSX.Element, b: JSX.Element) {
    return <div className="grid gap-2 sm:grid-cols-2">{a}{b}</div>
  }
  function safeObsEnf(txt?: string | null) {
    const t = txt || ''
    const m = /Enfermedad\s*:\s*([^|\n]+)/i.exec(t)
    return m ? m[1].trim() : ''
  }

  // === jsPDF en PT (más nítido) + Helvetica integrada ===
  async function printPdf(mode: 'download' | 'open' = 'download') {
    if (!ficha) return

    const pdf = new jsPDF({
      unit: 'pt',                 // 1pt = 1/72in
      format: [612, 936],         // 8.5in x 13in → 612 x 936 pt
      orientation: 'portrait',
      compress: true,
      precision: 12,              // mejor colocación de texto
    })

    const C_title: [number, number, number] = [18, 18, 18]
    const C_muted: [number, number, number] = [95, 95, 95]
    const C_border: [number, number, number] = [200, 200, 200]
    const C_ribbon: [number, number, number] = [28, 100, 180]

    pdf.setFont('helvetica', 'normal')
    const M = 36, W = 612, H = 936
    let y = M

    // Logo + banda
    try {
      const logo = await loadImageAsDataURL('/img/logo.png')
      pdf.addImage(logo, 'PNG', M, y - 4, 65, 65)
    } catch {}
    pdf.setFillColor(...C_ribbon)
    pdf.rect(M + 80, y + 2, W - (M * 2) - 80, 24, 'F')
    pdf.setTextColor(255,255,255); pdf.setFontSize(12)
    pdf.text('COLEGIO SAINT THOMAS - VALPARAÍSO', W/2 + 10, y + 19, { align: 'center' })
    pdf.setFontSize(10)
    pdf.text('FICHA DE MATRÍCULA', W/2 + 10, y + 36, { align: 'center' })
    y += 80

    // Cinta metadatos
    autoTable(pdf, {
      startY: y,
      theme: 'plain',
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineHeight: 1.2 },
      columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 180 }, 2: { cellWidth: 120 }, 3: { cellWidth: 180 } },
      body: [[
        `Año: ${ficha.school_year}`,
        `Nº Adm.: ${ficha.admission_number || '—'}`,
        `Fecha: ${ficha.admission_date || '—'}`,
        `Curso: ${ficha.courses?.name || '—'}`
      ]],
      didDrawCell: ({ cell }) => {
        if (cell.section === 'body') {
          pdf.setDrawColor(...C_border)
          pdf.rect(cell.x, cell.y, cell.width, cell.height)
        }
      }
    })
    // @ts-ignore
    y = (pdf as any).lastAutoTable.finalY + 12

    const tableWidth = W - M * 2
    const labelW = 180
    const valueW = tableWidth - labelW

    function box(title: string, rows: Array<[string, string]>) {
      pdf.setFontSize(9); pdf.setTextColor(...C_muted)
      pdf.text(title.toUpperCase(), M, y)
      y += 8

      autoTable(pdf, {
        startY: y,
        theme: 'grid',
        tableWidth,
        margin: { left: M, right: M },
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 6,
          lineColor: C_border,
          textColor: [30,30,30],
          overflow: 'linebreak',
          valign: 'middle',
          lineHeight: 1.2,
          halign: 'left',
        },
        headStyles: {
          fillColor: [248,248,248],
          textColor: [60,60,60],
          lineColor: C_border,
          font: 'helvetica',
          fontSize: 9,
          halign: 'left',
        },
        columnStyles: {
          0: { cellWidth: labelW, halign: 'left' },
          1: { cellWidth: valueW, halign: 'left' },
        },
        head: [['Campo', 'Valor']],
        body: rows.map(([k, v]) => [k, v || '—']),
      })
      // @ts-ignore
      y = (pdf as any).lastAutoTable.finalY + 12
    }

    const st = ficha.students
    const enfFromObs = safeObsEnf(ficha.observations)

    box('Estudiante', [
      ['RUN', st?.run || '—'],
      ['Nombres', st?.first_name || '—'],
      ['Apellidos', st?.last_name || '—'],
      ['Dirección', st?.address || '—'],
      ['Teléfono', st?.phone || '—'],
      ['Nacionalidad', st?.nationality || '—'],
      ['Enfermedad', enfFromObs || (ficha as any).health_condition || '—'],
      ['Colegio de procedencia', (ficha as any).previous_school || '—'],
      ['Vive con', (ficha as any).lives_with || '—'],
      ['Repitencia', (ficha as any).repetition ? 'Sí' : 'No'],
      ['Educación del padre', (ficha as any).father_education || '—'],
      ['Educación de la madre', (ficha as any).mother_education || '—'],
      ['Opción Media', (ficha as any).media_option ? (((ficha as any).media_option === 'artes') ? 'Artes' : 'Música') : '—'],
    ])

    box('Apoderado titular', [
      ['Nombre', `${(titular?.first_name ?? '')} ${(titular?.last_name ?? '')}`.trim() || '—'],
      ['Teléfono', titular?.phone || '—'],
      ['Email', titular?.email || '—'],
      ['Ocupación', titular?.occupation || '—'],
      ['Relación con el alumno', titular?.relationship || '—'],
    ])

    box('Apoderado suplente', [
      ['Nombre', `${(suplente?.first_name ?? '')} ${(suplente?.last_name ?? '')}`.trim() || '—'],
      ['Teléfono', suplente?.phone || '—'],
      ['Email', suplente?.email || '—'],
      ['Ocupación', suplente?.occupation || '—'],
      ['Relación con el alumno', suplente?.relationship || '—'],
    ])

    box('Declaración y autorización', [[
      '',
      'Yo, en calidad de apoderado titular y/o suplente del estudiante, declaro haber tomado conocimiento y aceptar los reglamentos internos, el proyecto educativo y el reglamento de convivencia escolar del establecimiento, disponibles en la página web www.sthomasc.cl y en las oficinas del colegio. Me comprometo a respetar y cumplir las normas, asistir regularmente a reuniones, mantenerme informado sobre la situación académica y formativa de mi hijo/a o pupilo/a, y notificar oportunamente cualquier situación relevante. Autorizo expresamente el uso de la imagen de mi hijo/a o pupilo/a en material institucional del colegio (folletos, página web, lienzos u otros), exclusivamente para fines educativos y de difusión. Asimismo, declaro comprender que, una vez completada la presente ficha, cualquier cambio de apoderado titular y/o suplente deberá ser solicitado por escrito y será evaluado individualmente por la Dirección, quien resolverá con la debida autorización expresa.'
    ]])

    // Firma
    const lineY = Math.min(y + 24, H - M - 64)
    pdf.setDrawColor(160,160,160)
    pdf.line(M + 86, lineY, W - M - 86, lineY)
    pdf.setTextColor(...C_muted); pdf.setFontSize(9)
    pdf.text('Firma Apoderado', W/2, lineY + 12, { align: 'center' })

    // Pie
    pdf.setFontSize(8); pdf.setTextColor(...C_muted)
    pdf.text('Documento generado por SIGA – Saint Thomas • ' + new Date().toLocaleDateString(),
             W/2, H - M + 8, { align: 'center' })

    if (mode === 'open') {
      const url = pdf.output('bloburl')
      window.open(url, '_blank')
    } else {
      pdf.save(`ficha_matricula_${ficha.id}.pdf`)
    }
  }

  if (loading) return <div className="p-6">Cargando ficha…</div>
  if (err) return (
    <div className="p-6">
      <p className="mb-3 text-red-700">Error: {err}</p>
      <button className="rounded bg-gray-800 px-3 py-2 text-white" onClick={() => router.back()}>Volver</button>
    </div>
  )
  if (!ficha) return <div className="p-6">No se encontró la ficha.</div>

  const st = ficha.students

  return (
    <div className="mx-auto max-w-[850px] p-6">
      {/* Estilos impresión */}
      <style jsx global>{`
        @page { size: 8.5in 13in; margin: 0.1mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Botonera */}
      <div className="mb-4 flex items-center justify-between no-print">
        <h1 className="text-xl font-bold">Ficha de matrícula #{ficha.id}</h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded bg-blue-600 px-4 py-2 text-white">
            PDF del navegador
          </button>
          <button onClick={() => printPdf('open')} className="rounded bg-indigo-600 px-4 py-2 text-white">
            Abrir PDF (jsPDF)
          </button>
          <button onClick={() => printPdf('download')} className="rounded bg-emerald-600 px-4 py-2 text-white">
            Descargar PDF (jsPDF)
          </button>
          <button onClick={() => history.back()} className="rounded bg-gray-800 px-4 py-2 text-white">
            Volver
          </button>
        </div>
      </div>

      {/* Hoja estilo informe */}
      <div className="sheet mx-auto max-w-[700px] rounded-xl border border-slate-200 bg-white p-6 shadow-[0_10px_25px_rgba(0,0,0,0.06)]">
        {/* Cabecera con banda */}
        <div className="relative mb-5 flex items-center">
          <img src="/img/logo.png" alt="Logo" className="h-12 w-12 object-contain" />
          <div className="ml-3">
            <div className="text-sm font-semibold text-slate-800">COLEGIO SAINT THOMAS - VALPARAÍSO</div>
            <div className="text-xs text-slate-500">FICHA DE MATRÍCULA</div>
          </div>
          <div className="ml-auto h-7 w-44 rounded bg-blue-600/90 text-center text-xs font-semibold leading-7 text-white">
            AÑO {ficha.school_year}
          </div>
        </div>

        {/* Cinta de metadatos */}
        <div className="mb-5 grid gap-2 rounded border border-slate-200 p-3 text-[13px] sm:grid-cols-4">
          <div><span className="font-semibold text-slate-700">Nº Adm.</span><div>{ficha.admission_number || '—'}</div></div>
          <div><span className="font-semibold text-slate-700">Fecha</span><div>{ficha.admission_date || '—'}</div></div>
          <div className="sm:col-span-2"><span className="font-semibold text-slate-700">Curso</span><div>{ficha.courses?.name || '—'}</div></div>
        </div>

        {/* Estudiante */}
        <section className="mb-5">
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500">ESTUDIANTE</h2>
          <div className="space-y-2 rounded border border-slate-200 p-4">
            {twoCol(<Row label="RUN" value={st?.run} />, <Row label="Teléfono" value={st?.phone} />)}
            {twoCol(<Row label="Nombres" value={st?.first_name} />, <Row label="Apellidos" value={st?.last_name} />)}
            {twoCol(<Row label="Nacionalidad" value={st?.nationality} />, <Row label="Dirección" value={st?.address} />)}
            {twoCol(
              <Row label="Enfermedad" value={safeObsEnf(ficha.observations) || (ficha as any).health_condition} />,
              <Row label="Colegio de procedencia" value={(ficha as any).previous_school} />
            )}
            {twoCol(
              <Row label="Vive con" value={(ficha as any).lives_with} />,
              <Row label="Repitencia" value={(ficha as any).repetition ? 'Sí' : 'No'} />
            )}
            {twoCol(
              <Row label="Educación del padre" value={(ficha as any).father_education} />,
              <Row label="Educación de la madre" value={(ficha as any).mother_education} />
            )}
            <Row label="Opción Media" value={(ficha as any).media_option ? ((ficha as any).media_option === 'artes' ? 'Artes' : 'Música') : '—'} />
          </div>
        </section>

        {/* Apoderado titular */}
        <section className="mb-5">
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500">APODERADO TITULAR</h2>
          <div className="space-y-2 rounded border border-slate-200 p-4">
            {twoCol(
              <Row label="Nombre" value={`${(titular?.first_name ?? '')} ${(titular?.last_name ?? '')}`.trim() || '—'} />,
              <Row label="Relación con el alumno" value={titular?.relationship} />
            )}
            {twoCol(<Row label="Teléfono" value={titular?.phone} />, <Row label="Email" value={titular?.email} />)}
            <Row label="Ocupación" value={titular?.occupation} />
          </div>
        </section>

        {/* Apoderado suplente */}
        <section className="mb-5">
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500">APODERADO SUPLENTE</h2>
          <div className="space-y-2 rounded border border-slate-200 p-4">
            {twoCol(
              <Row label="Nombre" value={`${(suplente?.first_name ?? '')} ${(suplente?.last_name ?? '')}`.trim() || '—'} />,
              <Row label="Relación con el alumno" value={suplente?.relationship} />
            )}
            {twoCol(<Row label="Teléfono" value={suplente?.phone} />, <Row label="Email" value={suplente?.email} />)}
            <Row label="Ocupación" value={suplente?.occupation} />
          </div>
        </section>

        {/* Observaciones */}
        <section className="mb-5">
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500">OBSERVACIONES</h2>
          <div className="rounded border border-slate-200 p-4">
            <p className="whitespace-pre-wrap text-[13px] text-slate-900">{ficha.observations || '—'}</p>
          </div>
        </section>

        {/* Declaración + Firma */}
        <section>
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-500">DECLARACIÓN Y AUTORIZACIÓN</h2>
          <div className="rounded border border-slate-200 p-4">
            <p className="text-[11px] leading-relaxed text-slate-800">
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

            <div className="mx-auto mt-10 max-w-md">
              <div className="h-px bg-slate-300" />
              <p className="mt-1 text-center text-sm text-slate-600">Firma Apoderado</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
