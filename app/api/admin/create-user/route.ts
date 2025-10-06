// app/api/admin/create-user/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

type Body = {
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  rut?: string | null
  role_code: string            // 'admin' | 'teacher' | 'guardian' | 'student'
  send_invite?: boolean        // default true
  password?: string            // requerido si send_invite=false y no quieres usar RUT
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body
    const {
      first_name, last_name, email,
      phone = null, rut = null, role_code,
      send_invite = true, password
    } = body

    // Validación básica
    if (!first_name || !last_name || !email || !role_code) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (first_name, last_name, email, role_code)' },
        { status: 400 }
      )
    }

    // 🔎 PRECHECK en app_users: evita chocar con únicos
    if (rut) {
      const { data: xRut, error: eRut } = await supabaseAdmin
        .from('app_users').select('id, first_name, last_name, email, rut')
        .eq('rut', rut).maybeSingle()
      if (eRut) {
        return NextResponse.json({ error: `Error revisando RUT: ${eRut.message}` }, { status: 500 })
      }
      if (xRut) {
        return NextResponse.json(
          { error: `RUT ya existe en el sistema`, hint: `Asociado a ${xRut.first_name} ${xRut.last_name} (${xRut.email})` },
          { status: 409 }
        )
      }
    }

    if (email) {
      const { data: xEmail, error: eEmail } = await supabaseAdmin
        .from('app_users').select('id, first_name, last_name, email, rut')
        .eq('email', email).maybeSingle()
      if (eEmail) {
        return NextResponse.json({ error: `Error revisando email: ${eEmail.message}` }, { status: 500 })
      }
      if (xEmail) {
        return NextResponse.json(
          { error: `Email ya existe en el sistema`, hint: `Ya está asociado a ${xEmail.first_name} ${xEmail.last_name}` },
          { status: 409 }
        )
      }
    }

    // 1) Crear usuario en Auth
    let authUserId: string | null = null

    if (send_invite) {
      // Invitación por correo (el usuario define su password)
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { first_name, last_name, phone, rut, role_code },
        redirectTo: 'http://localhost:3000/auth/callback',
      })
      if (error) {
        return NextResponse.json({ error: `Invite failed: ${error.message}` }, { status: 500 })
      }
      authUserId = data.user?.id ?? null
      if (!authUserId) {
        return NextResponse.json({ error: 'No se obtuvo id de usuario al invitar' }, { status: 500 })
      }
    } else {
      // Creación directa con password (sin invitación)
      if (!password || password.length < 8) {
        return NextResponse.json(
          { error: 'Password requerido (mín. 8 caracteres) cuando send_invite=false' },
          { status: 400 }
        )
      }
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name, last_name, phone, rut, role_code },
      })
      if (error) {
        return NextResponse.json({ error: `CreateUser failed: ${error.message}` }, { status: 500 })
      }
      authUserId = data.user?.id ?? null
      if (!authUserId) {
        return NextResponse.json({ error: 'No se obtuvo id de usuario al crear' }, { status: 500 })
      }
    }

    // 2) Insertar en app_users
    {
      const { error } = await supabaseAdmin
        .from('app_users')
        .insert({ id: authUserId, first_name, last_name, email, phone, rut })
      if (error) {
        return NextResponse.json({ error: `Error insertando app_users: ${error.message}` }, { status: 500 })
      }
    }

    // 3) Asignar rol
    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from('roles').select('id, code').eq('code', role_code).single()
    if (roleErr || !roleRow) {
      return NextResponse.json({ error: `Rol no encontrado: ${role_code}` }, { status: 400 })
    }
    const { error: urErr } = await supabaseAdmin
      .from('user_roles').insert({ user_id: authUserId, role_id: roleRow.id })
    if (urErr) {
      return NextResponse.json({ error: `Error insertando user_roles: ${urErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, user_id: authUserId })
  } catch (e: any) {
    console.error('create-user error:', e)
    return NextResponse.json(
      { error: e?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
