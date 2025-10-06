'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, RefreshCcw, ArrowLeft, PlusCircle, ChevronDown, ChevronUp, ListOrdered, Check, X, Hash } from 'lucide-react'

type PageProps = { params: { courseId: string; subjectId: string } }

type Student = { id: string; first_name: string | null; last_name: string | null; list_number: number | null }
type Assessment = { id: number; name: string; date: string | null; weight: number | null; term: any | null }
type Mark = { assessment_id: number; student_id: string; mark: number }

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
        'bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-60 ' +
        className
      }
      {...props}
    >
      {children}
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  )
}
function round1(x: number): number { return Number.isFinite(x) ? Math.round(x * 10) / 10 : NaN }
function normTerm(t: any): 'S0'|'S1'|'S2'|null {
  if (t===0||t==='0'||t==='S0'||t==='s0') return 'S0'
  if (t===1||t==='1'||t==='S1'||t==='s1') return 'S1'
  if (t===2||t==='2'||t==='S2'||t==='s2') return 'S2'
  return null
}

export default function LibroAsignaturaPage({ params }: PageProps) {
  const courseId = Number(params.courseId)
  const subjectId = Number(params.subjectId)

  const [students, setStudents] = useState<Student[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [cells, setCells] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Crear evaluación
  const [createOpen, setCreateOpen] = useState(false)
  const [cTitle, setCTitle] = useState('')
  const [cDate, setCDate] = useState('')
  const [cWeight, setCWeight] = useState<string>('')   // opcional
  const [cDesc, setCDesc] = useState('')               // opcional
  const [cTerm, setCTerm] = useState<string>('')       // '', 'S0', 'S1', 'S2'
  const [creating, setCreating] = useState(false)

  // Edición de lista
  const [editList, setEditList] = useState(false)
  const [listNums, setListNums] = useState<Record<string, string>>({}) // student_id -> string (permite vacío)
  const [savingList, setSavingList] = useState(false)

  async function loadAll() {
    setLoading(true); setError(null); setOkMsg(null)
    try {
      const res = await fetch(`/api/teacher/grades?course_id=${courseId}&subject_id=${subjectId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo cargar')

      const ss: Student[] = (json.students || []).map((s: any) => ({
        id: s.id, first_name: s.first_name ?? null, last_name: s.last_name ?? null, list_number: s.list_number ?? null,
      }))
      ss.sort((a,b)=>{
        const an=a.list_number, bn=b.list_number
        if (an!=null && bn!=null && an!==bn) return an-bn
        if (an!=null && bn==null) return -1
        if (an==null && bn!=null) return 1
        const aname=`${a.last_name ?? ''} ${a.first_name ?? ''}`
        const bname=`${b.last_name ?? ''} ${b.first_name ?? ''}`
        return aname.localeCompare(bname,'es')
      })
      setStudents(ss)

      // Estado de edición de lista
      const m: Record<string, string> = {}
      for (const s of ss) m[s.id] = s.list_number != null ? String(s.list_number) : ''
      setListNums(m)

      const normAssessments: Assessment[] = (json.assessments || []).map((a: any) => ({
        id: a.id, name: a.name ?? a.title, date: a.date ?? null, weight: a.weight ?? null, term: normTerm(a.term),
      }))
      setAssessments(normAssessments)

      const map: Record<string, string> = {}
      for (const m0 of (json.marks || []) as Mark[]) map[`${m0.student_id}:${m0.assessment_id}`] = String(m0.mark)
      setCells(map)
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Error cargando datos')
      setStudents([]); setAssessments([]); setCells({})
    } finally { setLoading(false) }
  }
  useEffect(() => { loadAll() }, [courseId, subjectId])

  function setCell(sid: string, aid: number, val: string) {
    setCells(prev => ({ ...prev, [`${sid}:${aid}`]: val })); setDirty(true)
  }

  // promedios por evaluación
  const avgsByAssessment = useMemo(() => {
    const out = new Map<number, number>()
    for (const a of assessments) {
      let sum=0,cnt=0
      for (const s of students) {
        const v = cells[`${s.id}:${a.id}`]
        if (v !== undefined && v !== '') { const n = Number(v); if (Number.isFinite(n)) { sum+=n; cnt++ } }
      }
      out.set(a.id, cnt? round1(sum/cnt): NaN)
    }
    return out
  }, [students, assessments, cells])

  // promedios S1/S2 + final
  type TermKey='S1'|'S2'
  const termAvgByStudent = useMemo(() => {
    const out = new Map<string, {S1:number|NaN;S2:number|NaN;FINAL:number|NaN}>()
    const aByTerm: Record<TermKey, Assessment[]> = {
      S1: assessments.filter(a=>normTerm(a.term)==='S1'),
      S2: assessments.filter(a=>normTerm(a.term)==='S2'),
    }
    for (const s of students) {
      const calc=(t:TermKey)=>{ let sum=0,cnt=0; for (const a of aByTerm[t]) {
        const v = cells[`${s.id}:${a.id}`]; if (v!==undefined && v!==''){ const n=Number(v); if(Number.isFinite(n)){ sum+=n; cnt++ } }
      } return cnt? round1(sum/cnt): NaN }
      const s1=calc('S1'), s2=calc('S2')
      let fin=NaN; const h1=Number.isFinite(s1), h2=Number.isFinite(s2)
      if (h1&&h2) fin=round1(((s1 as number)+(s2 as number))/2)
      else if (h1) fin=s1 as number
      else if (h2) fin=s2 as number
      out.set(s.id,{S1:s1,S2:s2,FINAL:fin})
    }
    return out
  }, [students, assessments, cells])

  const courseTermAverages = useMemo(()=> {
    const s1s:number[]=[], s2s:number[]=[]
    for (const s of students) {
      const r = termAvgByStudent.get(s.id); if(!r) continue
      if (Number.isFinite(r.S1)) s1s.push(r.S1 as number)
      if (Number.isFinite(r.S2)) s2s.push(r.S2 as number)
    }
    const s1 = s1s.length? round1(s1s.reduce((a,b)=>a+b,0)/s1s.length): NaN
    const s2 = s2s.length? round1(s2s.reduce((a,b)=>a+b,0)/s2s.length): NaN
    let fin=NaN; const h1=Number.isFinite(s1), h2=Number.isFinite(s2)
    if (h1&&h2) fin=round1(((s1 as number)+(s2 as number))/2)
    else if (h1) fin=s1 as number
    else if (h2) fin=s2 as number
    return { S1:s1, S2:s2, FINAL:fin }
  }, [students, termAvgByStudent])

  async function saveAll() {
    setSaving(true); setError(null); setOkMsg(null)
    try {
      const payload: { assessment_id:number; student_id:string; mark:number }[] = []
      for (const s of students) for (const a of assessments) {
        const raw = cells[`${s.id}:${a.id}`]; if (raw===''||raw===undefined) continue
        const mk = Number(raw); if (!Number.isFinite(mk)) continue
        payload.push({ assessment_id:a.id, student_id:s.id, mark:mk })
      }
      const res = await fetch('/api/teacher/grades', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ course_id:courseId, subject_id:subjectId, marks:payload }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'No se pudo guardar')
      setOkMsg('Notas guardadas'); setDirty(false)
    } catch(e:any) { setError(e?.message || 'Error guardando') } finally { setSaving(false) }
  }

  // === Crear evaluación ===
  async function createAssessment(e: React.FormEvent) {
    e.preventDefault()
    setOkMsg(null); setError(null)
    // Validaciones mínimas
    const name = cTitle.trim()
    if (!name) { setError('El título es obligatorio'); return }
    const weight = cWeight.trim() === '' ? null : Number(cWeight)
    if (cWeight.trim() !== '' && !Number.isFinite(weight!)) {
      setError('El peso debe ser numérico'); return
    }
    const term = normTerm(cTerm)
    const date = cDate || null
    const description = cDesc.trim() || null

    const payload = { course_id: courseId, subject_id: subjectId, name, date, weight, term, description }

    setCreating(true)
    try {
      // Intento principal: endpoint dedicado
      let res = await fetch('/api/teacher/assessments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // Fallback si no existe el endpoint dedicado
      if (res.status === 404) {
        res = await fetch('/api/teacher/grades', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create_assessment', ...payload }),
        })
      }

      const j = await res.json().catch(()=> ({}))
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `No se pudo crear la evaluación (HTTP ${res.status})`)
      }

      // OK: limpiar y recargar
      setCTitle(''); setCDate(''); setCWeight(''); setCDesc(''); setCTerm('')
      setOkMsg('Evaluación creada')
      setCreateOpen(false)
      await loadAll()
    } catch (err:any) {
      setError(err?.message || 'Error creando la evaluación')
    } finally {
      setCreating(false)
    }
  }

  // === Edición de números de lista ===
  function autonumerar() {
    const m: Record<string, string> = {}
    students.forEach((s, i) => { m[s.id] = String(i + 1) })
    setListNums(m)
  }
  async function guardarLista() {
    setSavingList(true); setError(null); setOkMsg(null)
    try {
      const numbers = students.map(s => ({
        student_id: s.id,
        list_number: listNums[s.id] === '' ? null : Number(listNums[s.id]),
      }))
      const res = await fetch('/api/teacher/roster', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, numbers }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      setOkMsg('Números de lista guardados')
      setEditList(false)
      await loadAll()
    } catch (e:any) {
      setError(e?.message || 'Error guardando lista')
    } finally {
      setSavingList(false)
    }
  }
  function cancelarLista() {
    const m: Record<string, string> = {}
    for (const s of students) m[s.id] = s.list_number != null ? String(s.list_number) : ''
    setListNums(m)
    setEditList(false)
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Libro de clases (planilla)</h1>
          <p className="text-sm text-slate-600">
            Curso <span className="font-mono">#{courseId}</span> · Asignatura <span className="font-mono">#{subjectId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={()=> (window.location.href='/teacher/cursos')} className="bg-gray-600 hover:bg-gray-700"><ArrowLeft className="h-4 w-4" /> Volver a cursos</Button>
          <Button onClick={loadAll}><RefreshCcw className="h-4 w-4" /> Recargar</Button>
          {!editList ? (
            <Button onClick={()=>setEditList(true)} className="bg-indigo-700 hover:bg-indigo-800"><ListOrdered className="h-4 w-4" /> Editar lista</Button>
          ) : (
            <>
              <Button onClick={autonumerar} className="bg-sky-700 hover:bg-sky-800"><Hash className="h-4 w-4" /> Autonumerar</Button>
              <Button onClick={guardarLista} disabled={savingList}><Check className="h-4 w-4" /> {savingList ? 'Guardando…' : 'Guardar lista'}</Button>
              <Button onClick={cancelarLista} className="bg-gray-600 hover:bg-gray-700"><X className="h-4 w-4" /> Cancelar</Button>
            </>
          )}
          <Button onClick={saveAll} disabled={saving || !dirty}>
            {saving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>) : (<><Save className="h-4 w-4" /> Guardar todo</>)}
          </Button>
        </div>
      </div>

      {/* Crear evaluación */}
      <div className="rounded-2xl border bg-white">
        <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={()=>setCreateOpen(v=>!v)}>
          <span className="inline-flex items-center gap-2 font-medium"><PlusCircle className="h-4 w-4" /> Nueva evaluación</span>
          {createOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {createOpen && (
          <form onSubmit={createAssessment} className="border-t px-4 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Título *">
              <input
                className="w-full rounded border px-3 py-2"
                placeholder="Ej: Prueba 1, Trabajo grupal…"
                value={cTitle}
                onChange={e=>setCTitle(e.target.value)}
                required
              />
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                className="w-full rounded border px-3 py-2"
                value={cDate}
                onChange={e=>setCDate(e.target.value)}
              />
            </Field>
            <Field label="Peso (opcional)">
              <input
                type="number" step={1} min={0} max={100}
                className="w-full rounded border px-3 py-2"
                placeholder="Ej: 20"
                value={cWeight}
                onChange={e=>setCWeight(e.target.value)}
              />
            </Field>
            <Field label="Semestre / término">
              <select
                className="w-full rounded border px-3 py-2"
                value={cTerm}
                onChange={e=>setCTerm(e.target.value)}
              >
                <option value="">— Sin término —</option>
                <option value="S0">S0 (Diagnóstica)</option>
                <option value="S1">S1 (1er semestre)</option>
                <option value="S2">S2 (2do semestre)</option>
              </select>
            </Field>
            <Field label="Descripción (opcional)">
              <input
                className="w-full rounded border px-3 py-2"
                placeholder="Breve descripción…"
                value={cDesc}
                onChange={e=>setCDesc(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                {creating ? (<><Loader2 className="h-4 w-4 animate-spin" /> Creando…</>) : (<>Crear evaluación</>)}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Planilla */}
      <div className="rounded-2xl border bg-white p-3 overflow-auto">
        {loading ? (
          <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : students.length === 0 ? (
          <div className="text-sm text-slate-500">No hay alumnos asignados al curso.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-white z-10 text-left py-2 pr-3 w-12">#</th>
                <th className="sticky left-12 bg-white z-10 text-left py-2 pr-3">Alumno</th>
                {assessments.map(a => (
                  <th key={a.id} className="text-left py-2 px-2 whitespace-nowrap">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.date || '—'} {normTerm(a.term) ? `· ${normTerm(a.term)}` : ''} {a.weight != null ? `· ${a.weight}` : ''}
                    </div>
                  </th>
                ))}
                <th className="text-left py-2 pl-3">Prom. S1</th>
                <th className="text-left py-2 pl-3">Prom. S2</th>
                <th className="text-left py-2 pl-3">Prom. Final</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => {
                const t = termAvgByStudent.get(s.id); const s1=t?.S1, s2=t?.S2, fin=t?.FINAL
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-white z-10 py-2 pr-3 w-12">
                      {!editList ? (
                        s.list_number ?? ''
                      ) : (
                        <input
                          type="number" min={1} max={999} step={1}
                          className="w-16 rounded border px-2 py-1"
                          value={listNums[s.id] ?? ''}
                          onChange={e => setListNums(prev => ({ ...prev, [s.id]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td className="sticky left-12 bg-white z-10 py-2 pr-3 whitespace-nowrap">
                      {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.id}
                    </td>
                    {assessments.map(a => {
                      const key = `${s.id}:${a.id}`; const val = cells[key] ?? ''
                      return (
                        <td key={key} className="py-2 px-2">
                          <input
                            type="number" inputMode="decimal" min={1} max={7} step={0.1}
                            className="w-20 rounded border px-2 py-1"
                            value={val}
                            onChange={(e)=>setCell(s.id, a.id, e.target.value)}
                            disabled={editList}
                          />
                        </td>
                      )
                    })}
                    <td className="py-2 pl-3 font-medium">{Number.isFinite(s1!) ? (s1 as number).toFixed(1) : '—'}</td>
                    <td className="py-2 pl-3 font-medium">{Number.isFinite(s2!) ? (s2 as number).toFixed(1) : '—'}</td>
                    <td className="py-2 pl-3 font-semibold">{Number.isFinite(fin!) ? (fin as number).toFixed(1) : '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td className="sticky left-0 bg-white z-10 py-2 pr-3 text-slate-600" colSpan={2}>Prom. evaluación / curso</td>
                {assessments.map(a => (
                  <td key={a.id} className="py-2 px-2 text-slate-700">
                    {Number.isFinite(avgsByAssessment.get(a.id)!) ? avgsByAssessment.get(a.id)!.toFixed(1) : '—'}
                  </td>
                ))}
                <td className="py-2 pl-3 font-medium text-slate-700">
                  {Number.isFinite(courseTermAverages.S1) ? courseTermAverages.S1.toFixed(1) : '—'}
                </td>
                <td className="py-2 pl-3 font-medium text-slate-700">
                  {Number.isFinite(courseTermAverages.S2) ? courseTermAverages.S2.toFixed(1) : '—'}
                </td>
                <td className="py-2 pl-3 font-semibold text-slate-800">
                  {Number.isFinite(courseTermAverages.FINAL) ? courseTermAverages.FINAL.toFixed(1) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="text-sm">
        {error && <div className="text-rose-700">Error: {error}</div>}
        {okMsg && <div className="text-emerald-700">{okMsg}</div>}
        {dirty && <div className="text-amber-700">Tienes cambios sin guardar.</div>}
      </div>
    </div>
  )
}
