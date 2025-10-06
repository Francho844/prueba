import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

type PatchBody = {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string | null
  rut?: string | null
  role_code?: string // 'admin' | 'teacher' | ...
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = params.id
  try {
    const body = (await req.json()) as PatchBody
    const { first_name, last_name, email, phone, rut, role_code } = body

    // --- Prechecks únicos: RUT y EMAIL (en app_users)
    if (rut) {
      const { data: xRut, error: eRut } = await supabaseAdmin
        .from('app_users')
        .select('id')
        .eq('rut', rut)
        .neq('id', userId)
        .maybeSingle()
      if (eRut) throw new Error(`Error revisando RUT: ${eRut.message}`)
      if (xRut) return NextResponse.json({ error: 'RUT ya existe' }, { status: 409 })
    }
    if (email) {
      const { data: xEmail, error: eEmail } = await supabaseAdmin
        .from('app_users')
        .select('id')
        .eq('email', email)
        .neq('id', userId)
        .maybeSingle()
      if (eEmail) throw new Error(`Error revisando email: ${eEmail.message}`)
      if (xEmail) return NextResponse.json({ error: 'Email ya existe' }, { status: 409 })
    }

    // --- Actualizar Auth (email y metadata)
    if (email || first_name || last_name || phone || rut) {
      const { error: upAuthErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: email || undefined,
        user_metadata: {
          ...(first_name !== undefined ? { first_name } : {}),
          ...(last_name !== undefined ? { last_name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(rut !== undefined ? { rut } : {}),
        },
      })
      if (upAuthErr) throw new Error(`Auth update failed: ${upAuthErr.message}`)
    }

    // --- Actualizar app_users
    const patchAU: any = {}
    if (first_name !== undefined) patchAU.first_name = first_name
    if (last_name !== undefined) patchAU.last_name = last_name
    if (email !== undefined) patchAU.email = email
    if (phone !== undefined) patchAU.phone = phone
    if (rut !== undefined) patchAU.rut = rut

    if (Object.keys(patchAU).length) {
      const { error: upAuErr } = await supabaseAdmin
        .from('app_users')
        .update(patchAU)
        .eq('id', userId)
      if (upAuErr) throw new Error(`Error actualizando app_users: ${upAuErr.message}`)
    }

    // --- Actualizar rol (reemplazar por role_code si vino)
    if (role_code) {
      const { data: roleRow, error: roleErr } = await supabaseAdmin
        .from('roles').select('id, code').eq('code', role_code).single()
      if (roleErr || !roleRow) {
        return NextResponse.json({ error: `Rol no encontrado: ${role_code}` }, { status: 400 })
      }
      // eliminar roles actuales y setear uno (simple)
      await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
      const { error: insRoleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role_id: roleRow.id })
      if (insRoleErr) throw new Error(`Error asignando rol: ${insRoleErr.message}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('PATCH /api/admin/users/[id] error:', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = params.id
  try {
    // Borra relaciones
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
    await supabaseAdmin.from('app_users').delete().eq('id', userId)
    // Borra en Auth
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (delAuthErr) throw new Error(`Auth delete failed: ${delAuthErr.message}`)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('DELETE /api/admin/users/[id] error:', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
