// lib/rut.ts
export function normalizeRut(input?: string | null): string | null {
  if (!input) return null
  // quita puntos, espacios; mantiene guion y dv
  const s = input.toString().trim().replace(/\./g, '').replace(/\s+/g, '')
  // ej: '12.345.678-9' -> '12345678-9'
  return s.toLowerCase()
}
