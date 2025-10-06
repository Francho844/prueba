// app/admin/AdminHome.tsx  (CLIENT)
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Loader2,
  GraduationCap,
  UserRoundCog,
  Users,
  BookOpenText,
  ClipboardList,
  FilePlus2,
  Settings,
  FileSpreadsheet,
  ShieldCheck,
  Megaphone,
  LogOut,
  UserPlus,
  UserPen,
} from 'lucide-react'

// Tarjeta reutilizable
function AdminCard({
  title,
  desc,
  href,
  Icon,
}: {
  title: string
  desc: string
  href: string
  Icon: any
}) {
  return (
    <a
      href={href}
      className="group rounded-2xl border bg-white/70 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border p-2">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-gray-600">{desc}</p>
        </div>
      </div>
    </a>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-white px-3 py-1 text-xs text-gray-700">
      {children}
    </span>
  )
}

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [stats, setStats] = useState<{
    students: number
    teachers: number
    courses: number
  } | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          window.location.href = '/login?redirect=/admin'
          return
        }

        // roles del usuario (requiere vista v_user_roles)
        const { data: rolesData } = await supabase
          .from('v_user_roles')
          .select('roles')
          .eq('user_id', session.user.id)
          .maybeSingle()

        const roleList = rolesData?.roles
          ? String(rolesData.roles).split(',')
          : []

        setRoles(roleList)

        // Si NO es admin, sácalo de aquí
        if (!roleList.includes('admin')) {
          window.location.href = '/dashboard'
          return
        }

        // Stats rápidas (pueden fallar si RLS restrictivo: ignora errores)
        try {
          const [{ count: stCount }, { count: uCount }, { count: cCount }] =
            await Promise.all([
              supabase.from('students').select('id', { count: 'exact', head: true }),
              supabase.from('app_users').select('id', { count: 'exact', head: true }),
              supabase.from('courses').select('id', { count: 'exact', head: true }),
            ])
          setStats({
            students: stCount ?? 0,
            teachers: uCount ?? 0,
            courses: cCount ?? 0,
          })
        } catch {
          setStats({ students: 0, teachers: 0, courses: 0 })
        }
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const isAdmin = useMemo(() => roles.includes('admin'), [roles])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border bg-rose-50 p-4 text-rose-700">
        <p className="font-semibold">Error</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Panel Administrador</h1>
          <p className="text-gray-600">
            Gestiona personas, cursos, asignaturas, matrículas y más.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Usuarios: {stats?.teachers ?? '-'}</Chip>
          <Chip>Estudiantes: {stats?.students ?? '-'}</Chip>
          <Chip>Cursos: {stats?.courses ?? '-'}</Chip>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminCard
          title="Matricular alumno"
          desc="Ficha presencial: crear/actualizar alumno + apoderados y matrícula"
          href="/matriculas/ficha"
          Icon={GraduationCap}
        />
        <AdminCard
          title="Estudiantes"
          desc="Buscar, crear, editar y dar de baja"
          href="/admin/alumnos"
          Icon={UserPlus}
        />
        <AdminCard
          title="Crear y Editar Usuario"
          desc="Dar de alta a un usuario y asignar rol"
          href="/admin/usuarios/"
          Icon={UserPen}
        />
        <AdminCard
          title="Cursos"
          desc="Crear/editar cursos, jornada y profesor jefe"
          href="/admin/cursos"
          Icon={Users}
        />
        <AdminCard
          title="Asignaturas"
          desc="Agregar ramos y asignarlos a cursos"
          href="/admin/asignaturas"
          Icon={BookOpenText}
        />
        <AdminCard
          title="Asignar Ramos a Profesores"
          desc="Definir evaluaciones por asignatura y semestre"
          href="/admin/teacher-assignments"
          Icon={ClipboardList}
        />
        <AdminCard
          title="jefaturas"
          desc="Subir estudiantes, cursos y asignaturas masivamente"
          href="/admin/homerooms"
          Icon={FileSpreadsheet}
        />
        <AdminCard
          title="Comunicados"
          desc="Publicar avisos por curso o generales"
          href="/admin/announcements"
          Icon={Megaphone}
        />
        <AdminCard
          title="Editar Usuarios"
          desc="Asignar admin/teacher y revisar accesos"
          href="/admin/usuarios"
          Icon={ShieldCheck}
        />
        <AdminCard
          title="Reportes"
          desc="Promedios, asistencia mensual, libretas PDF"
          href="/admin/reports"
          Icon={FilePlus2}
        />
        <AdminCard
          title="Configuración"
          desc="Año escolar, feriados, parámetros del sistema"
          href="/admin/settings"
          Icon={Settings}
        />
        <a
          href="/logout"
          className="group rounded-2xl border bg-white/70 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl border p-2">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Cerrar sesión</h3>
              <p className="text-sm text-gray-600">Salir del panel</p>
            </div>
          </div>
        </a>
      </div>

      {/* Sugerencias */}
      <div className="rounded-2xl border bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Sugerencias de mejora</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Importadores CSV con validación (RUN, duplicados)</li>
          <li>Bitácora (audit log) para altas/bajas y cambios de notas</li>
          <li>Bloqueo de edición tras cierre de semestre</li>
          <li>Roles finos: UTP, Inspectoría (lectura notas/asistencia)</li>
          <li>Notificaciones por email: próximas evaluaciones, inasistencias</li>
          <li>Copiar estructura al cambiar año escolar</li>
          <li>Libretas PDF por curso/semestre (descarga masiva)</li>
        </ul>
      </div>
    </div>
  )
}
