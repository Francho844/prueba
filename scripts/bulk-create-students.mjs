// scripts/bulk-create-students.mjs
import { createClient } from '@supabase/supabase-js'

// ====== Config ======
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOMAIN         = (process.env.NEXT_PUBLIC_RUN_LOGIN_DOMAIN || 'estudiante.stc').toLowerCase()
const DRY_RUN        = process.env.DRY_RUN === '1'

// ====== Helpers RUN ======
function normalizeRunPretty(x) {
  // deja sólo dígitos + K y re-inserta guion antes del DV
  const raw = String(x ?? '').trim()
  const compact = raw.replace(/[^0-9kK]/g, '').toUpperCase()
  if (compact.length < 2) return ''
  const body = compact.slice(0, -1)
  const dv   = compact.slice(-1)
  return `${body}-${dv}`
}
function normalizeRunCompact(x) {
  // sólo dígitos + K, sin separadores (para comparar)
  return String(x ?? '').replace(/[^0-9kK]/g, '').toLowerCase()
}
function isValidRun(runPretty) {
  const m = runPretty.match(/^(\d+)-([\dK])$/i)
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
function runToEmail(runPretty) {
  return `${runPretty}@${DOMAIN}`
}

// ====== Supabase ======
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan env: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

// ====== Utilidades ======
async function loadAllUsersByDomain() {
  // carga TODOS los usuarios del dominio y los indexa por email (lower)
  const byEmail = new Map()
  let page = 1
  while (true) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users || []) {
      const dom = (u.email || '').split('@')[1]?.toLowerCase()
      if (dom === DOMAIN) byEmail.set((u.email || '').toLowerCase(), u)
    }
    if (!data || (data.users || []).length < 1000) break
    page++
  }
  return byEmail
}

async function ensureRoleStudent(userId) {
  // Asegura rol 'student' con name no-nulo (tu schema lo pide)
  const { data: roleRow, error: e1 } = await supa
    .from('roles').select('id').eq('code','student').maybeSingle()
  if (e1) throw e1
  let roleId = roleRow?.id
  if (!roleId) {
    const { data: ins, error: e2 } = await supa
      .from('roles').insert({ code:'student', name:'Estudiante' })
      .select('id').maybeSingle()
    if (e2) throw e2
    roleId = ins.id
  }
  const { error: e3 } = await supa
    .from('user_roles').insert({ user_id:userId, role_id:roleId })
  if (e3 && e3.code !== '23505') throw e3
}

async function ensureAppUser(userObj, studentRow) {
  // Crea/actualiza espejo en app_users con nombres de students si los tenemos
  const row = {
    id: userObj.id,
    rut: studentRow?.run ?? null,
    first_name: (studentRow?.first_name || userObj.user_metadata?.first_name || userObj.user_metadata?.full_name || 'Estudiante').toString().trim() || 'Estudiante',
    last_name:  (studentRow?.last_name  || userObj.user_metadata?.last_name  || 'SinApellido').toString().trim() || 'SinApellido',
    email: userObj.email || null,
    phone: studentRow?.phone || null,
  }
  const { error } = await supa.from('app_users').upsert(row, { onConflict:'id' })
  if (error) throw error
}

async function linkStudentUserId(studentId, userId) {
  const { error } = await supa.from('students').update({ user_id:userId }).eq('id', studentId)
  if (error) throw error
}

// ====== Main ======
async function main() {
  const { data: students, error } = await supa
    .from('students')
    .select('id, run, first_name, last_name, phone, user_id')
    .order('id')
  if (error) throw error

  const usersByEmail = await loadAllUsersByDomain()

  let created=0, updated=0, linked=0, skippedInvalid=0, already=0

  for (const st of students || []) {
    const runPretty = normalizeRunPretty(st.run)
    const runCompact = normalizeRunCompact(st.run)

    if (!runPretty || !isValidRun(runPretty)) {
      skippedInvalid++
      continue
    }

    const email = runToEmail(runPretty)
    const emailKey = email.toLowerCase()
    let user = usersByEmail.get(emailKey)

    // crear si no existe
    if (!user) {
      if (DRY_RUN) {
        console.log('[DRY] crear', email, 'pass=', runPretty)
        // simula un objeto user mínimo para continuar el pipeline
        user = { id: 'dry-'+st.id, email, user_metadata:{ full_name: `${st.first_name||''} ${st.last_name||''}`.trim() } }
      } else {
        const { data: createdUser, error: e } = await supa.auth.admin.createUser({
          email, password: runPretty, email_confirm: true,
          user_metadata: {
            full_name: `${st.first_name||''} ${st.last_name||''}`.trim(),
            first_name: st.first_name || null,
            last_name:  st.last_name  || null,
          }
        })
        if (e) { console.error('ERROR creando', email, e.message); continue }
        user = createdUser.user
        usersByEmail.set(emailKey, user) // cache
      }
      created++
    } else {
      // existe: opcionalmente resetea password = RUN
      if (!DRY_RUN) {
        await supa.auth.admin.updateUserById(user.id, { password: runPretty }).catch(()=>{})
      } else {
        console.log('[DRY] update password de', email)
      }
      updated++
    }

    // espejo app_users + rol + enlace students.user_id
    if (!DRY_RUN) {
      await ensureAppUser(user, st)
      await ensureRoleStudent(user.id)
      if (!st.user_id) {
        await linkStudentUserId(st.id, user.id); linked++
      } else {
        already++
      }
    } else {
      console.log('[DRY] upsert app_users + rol + link students.user_id', st.id, '→', user.id)
    }
  }

  console.log('\nResumen:')
  console.log('  creados:      ', created)
  console.log('  actualizados:  ', updated)
  console.log('  enlazados:     ', linked)
  console.log('  ya enlazados:  ', already)
  console.log('  RUN inválidos: ', skippedInvalid)
}

main().catch(e => { console.error(e); process.exit(1) })
