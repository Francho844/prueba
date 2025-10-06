// lib/run.ts
export function normalizeRun(input: string): string {
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

export function isValidRun(run: string): boolean {
  const n = normalizeRun(run)
  const m = n.match(/^(\d+)-([\dK])$/i)
  if (!m) return false
  const body = m[1]
  const dv = m[2].toUpperCase()
  let sum = 0, mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const res = 11 - (sum % 11)
  const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res)
  return dvCalc === dv
}

/** Construye el email alias para Supabase a partir del RUN normalizado. */
export function runToEmail(
  run: string,
  domain = process.env.NEXT_PUBLIC_RUN_LOGIN_DOMAIN || 'estudiante.stc'
) {
  const n = normalizeRun(run)
  // si prefieres sin guion en el alias, usa: const alias = n.replace('-', '')
  const alias = n
  return `${alias}@${domain}`
}
