'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { Loader2, Save, Printer, Upload, Image as ImageIcon } from 'lucide-react'

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
  guardians?: Guardian | Guardian[] | null // admite array u objeto
}

// Normalizador: devuelve un solo Guardian o null
function pickOneGuardian(g?: Guardian | Guardian[] | null): Guardian | null {
  if (!g) return null
  return Array.isArray(g) ? (g[0] ?? null) : g
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

type SchoolYear = { id: number; year: number; active: boolean | null }
type Course = { id: number; name: string; code?: string | null; school_year_id?: number | null }
type ElectiveSubject = { id: number; name: string; code?: string | null }

export default function AlumnoDetailPage({ params }: { params: { id: string } }) {
  const { id } = params

  const [st, setSt] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // student form
  const [form, setForm] = useState<Student>({
    id: '',
    run: '',
    first_name: '',
    last_name: '',
    birthdate: '',
    gender: '',
    address: '',
    phone: '',
    nationality: '',
    photo_url: '',
    created_at: null,
  })

  // foto local
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // apoderados (links)
  const [sg, setSg] = useState<StudentGuardian[]>([])

  // formularios de apoderados
  const [gTit, setGTit] = useState<Guardian>({
    id: '',
    run: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    relationship: 'titular',
    occupation: '',
  })
  const [gSup, setGSup] = useState<Guardian>({
    id: '',
    run: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    relationship: 'suplente',
    occupation: '',
  })

  // matrícula (incluye curso y electivo)
  const [enroll, setEnroll] = useState<EnrollmentForm | null>(null)
  const [enrollForm, setEnrollForm] = useState<{
    school_year: number
    admission_number: string
    admission_date: string
    course_id: number | null
    elective_subject_id: number | null
  }>({
    school_year: new Date().getFullYear(),
    admission_number: '',
    admission_date: new Date().toISOString().slice(0, 10),
    course_id: null,
    elective_subject_id: null,
  })

  // Años escolares, cursos, electivos por año
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [coursesForYear, setCoursesForYear] = useState<Course[]>([])
  const [electivesForYear, setElectivesForYear] = useState<ElectiveSubject[]>([])
  const [courseNameForFicha, setCourseNameForFicha] = useState<string>('—')
  const [electiveNameForFicha, setElectiveNameForFicha] = useState<string>('—')

  // ==== helpers
  const normRole = (r?: string | null) => {
    const v = (r || '').toLowerCase()
    if (['titular', 'madre', 'padre', 'apoderado'].includes(v)) return 'titular'
    if (['suplente', 'tutor suplente'].includes(v)) return 'suplente'
    return v || null
  }

  // ===== Carga inicial
  useEffect(() => {
    ;(async () => {
      setLoading(true); setError(null)

      // Alumno
      const { data: stu, error: e1 } = await supabase
        .from('students')
        .select('id, run, first_name, last_name, birthdate, gender, address, phone, nationality, photo_url, created_at')
        .eq('id', id)
        .single()
      if (e1) { setError(e1.message); setLoading(false); return }
      setSt(stu as any)
      setForm(stu as any)

      // Años escolares
      const { data: sys } = await supabase
        .from('school_years')
        .select('id, year, active')
        .order('year', { ascending: false })
      setSchoolYears(sys || [])
      const activeYear = (sys || []).find(y => y.active)?.year || new Date().getFullYear()

      // Student ↔ Guardians (normalizamos roles)
      const { data: links } = await supabase
        .from('student_guardians')
        .select(`
          student_id, guardian_id, role,
          guardians (
            id, run, first_name, last_name, email, phone, relationship, occupation
          )
        `)
        .eq('student_id', id)

      const linksNorm = (links || []).map(l => ({ ...l, role: normRole(l.role) }))
      setSg(linksNorm as any)

      const titRaw = linksNorm.find(x => x.role === 'titular')?.guardians
      const supRaw = linksNorm.find(x => x.role === 'suplente')?.guardians

      const titOne = pickOneGuardian(titRaw)
      if (titOne) setGTit(prev => ({ ...prev, ...titOne, relationship: 'titular' }))

      const supOne = pickOneGuardian(supRaw)
      if (supOne) setGSup(prev => ({ ...prev, ...supOne, relationship: 'suplente' }))


      // Matrícula (año activo si existe; sino la última)
      let ef: EnrollmentForm | null = null
      const { data: efAct } = await supabase
        .from('enrollment_forms')
        .select('id, student_id, course_id, school_year, admission_number, admission_date, elective_subject_id, created_at')
        .eq('student_id', id)
        .eq('school_year', activeYear)
        .maybeSingle()
      ef = efAct || null
      if (!ef) {
        const { data: efLast } = await supabase
          .from('enrollment_forms')
          .select('id, student_id, course_id, school_year, admission_number, admission_date, elective_subject_id, created_at')
          .eq('student_id', id)
          .order('school_year', { ascending: false })
          .limit(1)
          .maybeSingle()
        ef = efLast || null
      }
      setEnroll(ef)

      const initYear = ef?.school_year ?? activeYear
      setEnrollForm({
        school_year: initYear,
        admission_number: ef?.admission_number ?? '',
        admission_date: ef?.admission_date ?? new Date().toISOString().slice(0, 10),
        course_id: ef?.course_id ?? null,
        elective_subject_id: ef?.elective_subject_id ?? null,
      })

      setLoading(false)

      if (typeof window !== 'undefined' && window.location.hash === '#ficha') {
        document.getElementById('ficha')?.scrollIntoView({ behavior: 'smooth' })
      }
    })()
  }, [id])

  // ===== Carga cursos y electivos según Año Escolar seleccionado
  useEffect(() => {
    ;(async () => {
      const yearRow = schoolYears.find(y => y.year === enrollForm.school_year)
      if (!yearRow) {
        setCoursesForYear([]); setCourseNameForFicha('—')
        setElectivesForYear([]); setElectiveNameForFicha('—')
        return
      }
      const schoolYearId = yearRow.id

      // Cursos
      const { data: crs } = await supabase
        .from('courses')
        .select('id, name, code, school_year_id')
        .eq('school_year_id', schoolYearId)
        .order('name', { ascending: true })
      setCoursesForYear(crs || [])

      // Si ya hay course_id, refresca nombre
      if (enrollForm.course_id) {
        const found = (crs || []).find(c => c.id === enrollForm.course_id)
        setCourseNameForFicha(found?.name || '—')
      } else {
        setCourseNameForFicha('—')
      }

      // Electivos (Arte/Música del grupo)
      const { data: elec } = await supabase
        .from('subjects')
        .select('id, name, code, is_elective, group_code, school_year_id')
        .eq('is_elective', true)
        .eq('group_code', 'ELECTIVO_ART_MUS')
        .eq('school_year_id', schoolYearId)
        .order('name', { ascending: true })
      const mapped = (elec || []).map(s => ({ id: s.id, name: s.name, code: (s as any).code }))
      setElectivesForYear(mapped)

      if (enrollForm.elective_subject_id) {
        const foundE = mapped.find(s => s.id === enrollForm.elective_subject_id)
        setElectiveNameForFicha(foundE?.name || '—')
      } else {
        setElectiveNameForFicha('—')
      }
    })()
  }, [enrollForm.school_year, schoolYears])

  // Si cambia el course_id o la lista, actualizar nombre para ficha
  useEffect(() => {
    if (!enrollForm.course_id) { setCourseNameForFicha('—'); return }
    const found = coursesForYear.find(c => c.id === enrollForm.course_id)
    setCourseNameForFicha(found?.name || '—')
  }, [enrollForm.course_id, coursesForYear])

  // Si cambia electivo, actualizar nombre para ficha
  useEffect(() => {
    if (!enrollForm.elective_subject_id) { setElectiveNameForFicha('—'); return }
    const found = electivesForYear.find(e => e.id === enrollForm.elective_subject_id)
    setElectiveNameForFicha(found?.name || '—')
  }, [enrollForm.elective_subject_id, electivesForYear])

  // ==== Guardar alumno
  async function saveStudent(e: React.FormEvent) {
    e.preventDefault()
    try {
      setSaving(true); setError(null)
      const payload = {
        run: form.run || null,
        first_name: form.first_name || '',
        last_name: form.last_name || '',
        birthdate: form.birthdate || null,
        gender: form.gender || null,
        address: form.address || null,
        phone: form.phone || null,
        nationality: form.nationality || null,
        photo_url: form.photo_url || null,
      }
      const { error } = await supabase.from('students').update(payload).eq('id', id)
      if (error) throw error
      alert('Datos del alumno guardados')
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // ==== Subir foto
  async function uploadPhoto() {
    if (!photoFile) return alert('Selecciona una imagen primero.')
    try {
      setSaving(true); setError(null)

      const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('students').upload(path, photoFile, {
        upsert: true,
        contentType: photoFile.type || 'image/jpeg',
      })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('students').getPublicUrl(path)
      const publicUrl = pub?.publicUrl || ''

      const { error: updErr } = await supabase.from('students').update({ photo_url: publicUrl }).eq('id', id)
      if (updErr) throw updErr

      setForm(f => ({ ...f, photo_url: publicUrl }))
      setSt(s => (s ? { ...s, photo_url: publicUrl } : s))
      alert('Foto actualizada')
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // ==== Guardar/crear apoderados
  async function saveGuardian(which: 'titular' | 'suplente') {
    const formG = which === 'titular' ? gTit : gSup
    try {
      setSaving(true); setError(null)
      let guardianId = formG.id || null

      // UPSERT guardian
      if (guardianId) {
        const { error } = await supabase.from('guardians').update({
          run: formG.run || null,
          first_name: formG.first_name || '',
          last_name: formG.last_name || '',
          email: formG.email || null,
          phone: formG.phone || null,
          relationship: formG.relationship || which,
          occupation: formG.occupation || null,
        }).eq('id', guardianId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('guardians').insert({
          run: formG.run || null,
          first_name: formG.first_name || '',
          last_name: formG.last_name || '',
          email: formG.email || null,
          phone: formG.phone || null,
          relationship: which,
          occupation: formG.occupation || null,
        }).select('id').single()
        if (error) throw error
        guardianId = data!.id
        if (which === 'titular') setGTit(g => ({ ...g, id: guardianId! }))
        else setGSup(g => ({ ...g, id: guardianId! }))
      }

      // Vincular (si ya existe fila, solo actualizar guardian_id/role)
      const { data: link } = await supabase
        .from('student_guardians')
        .select('student_id, guardian_id, role')
        .eq('student_id', id)
        .eq('role', which)
        .maybeSingle()

      if (!link) {
        const { error: eIns } = await supabase.from('student_guardians').insert({
          student_id: id,
          guardian_id: guardianId!,
          role: which,
        })
        if (eIns) throw eIns
      } else {
        if (link.guardian_id !== guardianId) {
          const { error: eUpd } = await supabase.from('student_guardians')
            .update({ guardian_id: guardianId! })
            .eq('student_id', id)
            .eq('role', which)
          if (eUpd) throw eUpd
        }
      }

      // Recargar vínculos normalizados
      const { data: links2 } = await supabase
        .from('student_guardians')
        .select(`
          student_id, guardian_id, role,
          guardians (
            id, run, first_name, last_name, email, phone, relationship, occupation
          )
        `)
        .eq('student_id', id)

      const linksNorm2 = (links2 || []).map(l => ({ ...l, role: normRole(l.role) }))
      setSg(linksNorm2 as any)
      alert(`Apoderado ${which} guardado`)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // ==== Guardar matrícula (incluye course_id + elective_subject_id)
  async function saveEnrollment(e: React.FormEvent) {
    e.preventDefault()
    try {
      setSaving(true); setError(null)

      const payload = {
        school_year: enrollForm.school_year,
        admission_number: enrollForm.admission_number || null,
        admission_date: enrollForm.admission_date || null,
        course_id: enrollForm.course_id,
        elective_subject_id: enrollForm.elective_subject_id,
      }

      if (enroll?.id) {
        const { error } = await supabase.from('enrollment_forms').update(payload).eq('id', enroll.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('enrollment_forms').insert({
          student_id: id,
          ...payload,
          created_at: new Date().toISOString(),
        }).select('id').single()
        if (error) throw error
        setEnroll({
          id: data!.id,
          student_id: id,
          course_id: enrollForm.course_id,
          school_year: enrollForm.school_year,
          admission_number: enrollForm.admission_number || null,
          admission_date: enrollForm.admission_date || null,
          elective_subject_id: enrollForm.elective_subject_id,
          created_at: new Date().toISOString(),
        })
      }

      // Nombres para ficha
      if (enrollForm.course_id && coursesForYear.length) {
        const found = coursesForYear.find(c => c.id === enrollForm.course_id)
        setCourseNameForFicha(found?.name || '—')
      } else {
        setCourseNameForFicha('—')
      }
      if (enrollForm.elective_subject_id && electivesForYear.length) {
        const foundE = electivesForYear.find(e => e.id === enrollForm.elective_subject_id)
        setElectiveNameForFicha(foundE?.name || '—')
      } else {
        setElectiveNameForFicha('—')
      }

      alert('Matrícula guardada')
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  // ====== Derivados para FICHA (con fallback a formularios)
  const titularForFicha = useMemo<Guardian | null>(() => {
    const row = sg.find(x => x.role === 'titular')
    if (row?.guardians) return row.guardians
    // fallback: si hay datos escritos en el form titular, úsalos
    if (gTit.run || gTit.first_name || gTit.last_name || gTit.email || gTit.phone) return gTit
    return null
  }, [sg, gTit])

  const suplenteForFicha = useMemo<Guardian | null>(() => {
    const row = sg.find(x => x.role === 'suplente')
    if (row?.guardians) return row.guardians
    if (gSup.run || gSup.first_name || gSup.last_name || gSup.email || gSup.phone) return gSup
    return null
  }, [sg, gSup])

  if (loading) return <div className="p-6 text-slate-600 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
  if (!st) return <div className="p-6 text-rose-700">No se encontró el alumno.</div>

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Cabecera */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src="/img/logo.png" alt="Logo" className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold">Alumno</h1>
            <p className="text-sm text-slate-600">{st.last_name}, {st.first_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (window.location.href = '/admin/alumnos')}
            className="rounded bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            ← Volver a la lista
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded bg-fuchsia-700 px-3 py-2 text-sm font-medium text-white hover:bg-fuchsia-800"
          >
            <Printer className="h-4 w-4" /> Imprimir ficha
          </button>
        </div>
      </div>

      {/* Editor alumno + foto */}
      <form onSubmit={saveStudent} className="mb-8 grid gap-6 rounded-lg border bg-white p-4 sm:grid-cols-3">
        <div className="sm:col-span-2 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">RUN</label>
              <input className="w-full rounded border px-3 py-2" value={form.run ?? ''} onChange={e => setForm(f => ({ ...f, run: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Teléfono</label>
              <input className="w-full rounded border px-3 py-2" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Nombres</label>
              <input required className="w-full rounded border px-3 py-2" value={form.first_name ?? ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Apellidos</label>
              <input required className="w-full rounded border px-3 py-2" value={form.last_name ?? ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha de nacimiento</label>
              <input type="date" className="w-full rounded border px-3 py-2" value={form.birthdate ?? ''} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Género</label>
              <input className="w-full rounded border px-3 py-2" value={form.gender ?? ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} placeholder="M/F/Otro" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Nacionalidad</label>
              <input className="w-full rounded border px-3 py-2" value={form.nationality ?? ''} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Dirección</label>
            <input className="w-full rounded border px-3 py-2" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>

          {error && <p className="text-sm text-rose-700">Error: {error}</p>}

          <div className="mt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        </div>

        {/* Foto */}
        <div>
          <div className="mb-2 text-sm font-medium">Foto del alumno</div>
          <div className="flex flex-col items-center gap-3 rounded border p-3">
            <div className="h-40 w-40 overflow-hidden rounded bg-slate-100 ring-1 ring-slate-200">
              {photoPreview ? (
                <img src={photoPreview} alt="preview" className="h-full w-full object-cover" />
              ) : form.photo_url ? (
                <img src={form.photo_url} alt="alumno" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImageIcon className="h-10 w-10" />
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setPhotoFile(file)
                setPhotoPreview(file ? URL.createObjectURL(file) : null)
              }}
              className="w-full text-sm"
            />
            <button
              type="button"
              onClick={uploadPhoto}
              disabled={!photoFile || saving}
              className="inline-flex items-center gap-2 rounded bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" /> Subir/Actualizar foto
            </button>
            <p className="text-xs text-slate-500">Usa una imagen cuadrada ~600×600px para mejor recorte.</p>
          </div>
        </div>
      </form>

      {/* Apoderados */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        {/* Titular */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-lg font-semibold">Apoderado titular</div>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">RUN</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.run ?? ''} onChange={e => setGTit(v => ({ ...v, run: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Teléfono</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.phone ?? ''} onChange={e => setGTit(v => ({ ...v, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Nombres</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.first_name ?? ''} onChange={e => setGTit(v => ({ ...v, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Apellidos</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.last_name ?? ''} onChange={e => setGTit(v => ({ ...v, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.email ?? ''} onChange={e => setGTit(v => ({ ...v, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Ocupación</label>
                <input className="w-full rounded border px-3 py-2" value={gTit.occupation ?? ''} onChange={e => setGTit(v => ({ ...v, occupation: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => saveGuardian('titular')}
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Guardar titular
              </button>
            </div>
          </div>
        </div>

        {/* Suplente */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-lg font-semibold">Apoderado suplente</div>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">RUN</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.run ?? ''} onChange={e => setGSup(v => ({ ...v, run: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Teléfono</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.phone ?? ''} onChange={e => setGSup(v => ({ ...v, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Nombres</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.first_name ?? ''} onChange={e => setGSup(v => ({ ...v, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Apellidos</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.last_name ?? ''} onChange={e => setGSup(v => ({ ...v, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.email ?? ''} onChange={e => setGSup(v => ({ ...v, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Ocupación</label>
                <input className="w-full rounded border px-3 py-2" value={gSup.occupation ?? ''} onChange={e => setGSup(v => ({ ...v, occupation: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => saveGuardian('suplente')}
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Guardar suplente
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Matrícula (curso + electivo por año) */}
      <form onSubmit={saveEnrollment} className="mb-8 rounded-lg border bg-white p-4">
        <div className="mb-2 text-lg font-semibold">Matrícula</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Año escolar</label>
            <input
              type="number"
              min={2000}
              max={2100}
              className="w-full rounded border px-3 py-2"
              value={enrollForm.school_year}
              onChange={(e) => {
                const v = Number(e.target.value)
                setEnrollForm(prev => ({
                  ...prev,
                  school_year: v,
                  course_id: null,           // reset curso si cambia año
                  elective_subject_id: null, // reset electivo si cambia año
                }))
              }}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Curso</label>
            <select
              className="w-full rounded border px-3 py-2"
              value={enrollForm.course_id ?? ''}
              onChange={(e) => setEnrollForm(prev => ({ ...prev, course_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— Sin curso —</option>
              {coursesForYear.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Cursos del año {enrollForm.school_year}.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Fecha de admisión</label>
            <input
              type="date"
              className="w-full rounded border px-3 py-2"
              value={enrollForm.admission_date}
              onChange={(e) => setEnrollForm(v => ({ ...v, admission_date: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Electivo (1°–4° medio): Arte / Música</label>
            <select
              className="w-full rounded border px-3 py-2"
              value={enrollForm.elective_subject_id ?? ''}
              onChange={(e) => setEnrollForm(prev => ({
                ...prev,
                elective_subject_id: e.target.value ? Number(e.target.value) : null
              }))}
            >
              <option value="">— Selecciona electivo —</option>
              {electivesForYear.map(e => (
                <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ''}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Solo electivos del año {enrollForm.school_year}. Si no corresponde, déjalo vacío.
            </p>
          </div>

          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium">N° de admisión</label>
            <input
              className="w-full rounded border px-3 py-2"
              value={enrollForm.admission_number}
              onChange={(e) => setEnrollForm(v => ({ ...v, admission_number: e.target.value }))}
              placeholder="Ej: 000123"
            />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800" disabled={saving}>
            Guardar matrícula
          </button>
        </div>
      </form>

      {/* Ficha imprimible */}
      <div id="ficha" className="rounded-lg border bg-white p-6">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-3">
            <img src="/img/logo.png" alt="Logo" className="h-12 w-12" />
            <div>
              <h2 className="text-xl font-bold">Ficha del Alumno</h2>
              <p className="text-sm text-slate-600">Saint Thomas Valparaíso</p>
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div><strong>Fecha:</strong> {new Date().toLocaleDateString()}</div>
            <div><strong>ID:</strong> {st.id}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="text-xs font-semibold uppercase text-slate-500">Alumno</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>RUN:</strong> {st.run || '—'}</div>
              <div><strong>Nombre:</strong> {st.first_name} {st.last_name}</div>
              <div><strong>Nacimiento:</strong> {st.birthdate || '—'}</div>
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
                <div className="h-40 w-40 bg-slate-100"></div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Apoderado titular</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>Nombre:</strong> {titularForFicha ? `${titularForFicha.first_name} ${titularForFicha.last_name}` : '—'}</div>
              <div><strong>RUN:</strong> {titularForFicha?.run || '—'}</div>
              <div><strong>Teléfono:</strong> {titularForFicha?.phone || '—'}</div>
              <div><strong>Email:</strong> {titularForFicha?.email || '—'}</div>
              <div><strong>Ocupación:</strong> {titularForFicha?.occupation || '—'}</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Apoderado suplente</div>
            <div className="mt-1 rounded border p-3">
              <div><strong>Nombre:</strong> {suplenteForFicha ? `${suplenteForFicha.first_name} ${suplenteForFicha.last_name}` : '—'}</div>
              <div><strong>RUN:</strong> {suplenteForFicha?.run || '—'}</div>
              <div><strong>Teléfono:</strong> {suplenteForFicha?.phone || '—'}</div>
              <div><strong>Email:</strong> {suplenteForFicha?.email || '—'}</div>
              <div><strong>Ocupación:</strong> {suplenteForFicha?.occupation || '—'}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Matrícula</div>
          <div className="mt-1 rounded border p-3">
            <div><strong>Año escolar:</strong> {enrollForm.school_year}</div>
            <div><strong>Curso:</strong> {courseNameForFicha}</div>
            <div><strong>Electivo:</strong> {electiveNameForFicha}</div>
            <div><strong>N° de admisión:</strong> {enrollForm.admission_number || '—'}</div>
            <div><strong>Fecha de admisión:</strong> {enrollForm.admission_date || '—'}</div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          * Esta ficha resume datos del estudiante, apoderados y matrícula. Use los formularios superiores para modificar y guarde los cambios.
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
