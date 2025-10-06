// scripts/sync-students-to-auth.mjs
import { createClient } from '@supabase/supabase-js'

// ===== Helpers RUN =====
function normalizeRun(input) {
  const raw = (input || '').toString().trim().replace(/\./g, '').replace(/\s+/g, '')
  if (/-/.test(raw)) {
    const [num, dv] = raw.split('-')
    return `${num}${dv ? '-' + dv.toUpperCase() : ''}`
  }
  if (raw.length >= 2) {
    const num = raw.slice(0, -1)
    const dv = raw.slice(-1).toUpperCase()
    return `${num}-${dv}`
  }
  return raw.toUpperCase()
}
function isValidRun(run) {
  const n = normalizeRun(run)
  const m = n.match(/^(\d+)-([\dK])$/i)
  if (!m) return false
  const body = m[1], dv = m[2].toUpperCase()
  let sum = 0, mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (sum % 11)
  const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return dvCalc === dv
}
function runToEmail(run, domain) {
  const alias = normalizeRun(run) // mantiene guion
  return `${alias}@${domain}`
}

// ===== Config =====
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMAIN = process.env.NEXT_PUBLIC_RUN_LOGIN_DOMAIN || 'estudiante.stc'
const DRY_RUN = process.env.DRY_RUN === '1' // simulación

if (!url || !service) {
  console.error('Faltan env: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supa = createClient(url, service)

// Busca usuario por email, paginando
async function findUserByEmail(email) {
  let page = 1
  while (true) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const u = data?.users?.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
    if (u) return u
    if (!data || data.users.length < 1000) return null
    page++
  }
}

// ✅ versión corregida (sin .catch encadenado)
async function ensureRoleStudent(userId) {
  const { data: roleRow, error: e1 } = await supa
    .from('roles')
    .select('id')
    .eq('code', 'student')
    .maybeSingle()
  if (e1) throw e1

  let roleId = roleRow?.id
  if (!roleId) {
    const { data: ins, error: e2 } = await supa
      .from('roles')
      .insert({ code: 'student', name: 'Estudiante' })
      .select('id')
      .maybeSingle()
    if (e2) throw e2
    roleId = ins.id
  }

  const { error: e3 } = await supa
    .from('user_roles')
    .insert({ user_id: userId, role_id: roleId })
  if (e3 && e3.code !== '23505') throw e3
}

// Vincula a students.user_id por RUN (opcional)
async function linkStudent(userId, runNorm) {
  if (DRY_RUN) { console.log(`DRY: students.user_id=${userId} where run='${runNorm}'`); return }
  const { error } = await supa.from('students').update({ user_id: userId }).eq('run', runNorm)
  if (error) console.warn('No se pudo vincular students.user_id:', error.message)
}

async function main() {
  const { data: studs, error } = await supa
    .from('students')
    .select('id, run, first_name, last_name')
    .order('id')
  if (error) throw error

  let created = 0, updated = 0, skipped = 0

  for (const st of studs || []) {
    const runRaw = (st.run || '').trim()
    if (!runRaw) { console.log('SIN RUN, skip:', st.id); skipped++; continue }
    const runNorm = normalizeRun(runRaw)
    if (!isValidRun(runNorm)) { console.log('RUN inválido, skip:', st.id, runRaw); skipped++; continue }

    const email = runToEmail(runNorm, DOMAIN)
    const password = runNorm

    const existing = await findUserByEmail(email)
    if (!existing) {
      if (DRY_RUN) {
        console.log(`DRY: crear ${email} / pass=${password}`)
      } else {
        const { data: createdUser, error: e } = await supa.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: `${st.first_name||''} ${st.last_name||''}`.trim() }
        })
        if (e) { console.error('Error creando', email, e.message); skipped++; continue }
        await ensureRoleStudent(createdUser.user.id)
        await linkStudent(createdUser.user.id, runNorm)
      }
      created++; console.log('CREADO:', email)
    } else {
      if (!DRY_RUN) {
        // reset password a RUN (opcional) y asegura rol + vínculo
        await supa.auth.admin.updateUserById(existing.id, { password }).catch(()=>{})
        await ensureRoleStudent(existing.id)
        await linkStudent(existing.id, runNorm)
      }
      updated++; console.log('EXISTE (actualizado):', email)
    }
  }

  console.log(`\nResumen -> creados: ${created}, actualizados: ${updated}, omitidos: ${skipped}`)
}
main().catch(err => { console.error(err); process.exit(1) })
