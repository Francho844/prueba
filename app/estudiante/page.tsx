// app/estudiante/page.tsx
'use client'

import Link from 'next/link'
import { User, BookOpen, GraduationCap, CalendarDays, MessageSquare, FileText, Lock, ClipboardList, School } from 'lucide-react'

type CardProps = { href: string; title: string; desc: string; icon: React.ReactNode }
function MenuCard({ href, title, desc, icon }: CardProps) {
  return (
    <Link
      href={href}
      className="group relative block rounded-2xl border bg-white p-4 ring-0 transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-600"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border bg-slate-50 p-3 text-slate-700 group-hover:border-slate-300">
          {icon}
        </div>
        <div>
          <div className="text-base font-semibold">{title}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </div>
    </Link>
  )
}

export default function EstudianteHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi Portal</h1>
        <p className="text-sm text-slate-600">Accesos rápidos a tus herramientas y registros.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MenuCard
          href="/estudiante/mis-datos"
          title="Mis datos"
          desc="Revisa tu ficha personal."
          icon={<User className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/cursos"
          title="Mis cursos"
          desc="Lista de cursos y asignaturas."
          icon={<School className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/notas"
          title="Notas"
          desc="Calificaciones por asignatura y período."
          icon={<GraduationCap className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/asistencia"
          title="Asistencia"
          desc="Presencias, inasistencias y atrasos."
          icon={<ClipboardList className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/evaluaciones"
          title="Evaluaciones"
          desc="Calendario de pruebas y trabajos."
          icon={<CalendarDays className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/mensajes"
          title="Comunicaciones"
          desc="Circulares y mensajes del colegio."
          icon={<MessageSquare className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/material"
          title="Material de estudio"
          desc="Guías y documentos."
          icon={<FileText className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/libro"
          title="Libro de clases"
          desc="Resumen por asignatura."
          icon={<BookOpen className="h-6 w-6" />}
        />
        <MenuCard
          href="/estudiante/cambiar-clave"
          title="Cambiar contraseña"
          desc="Actualiza tu contraseña."
          icon={<Lock className="h-6 w-6" />}
        />
      </div>

      {/* Sugerencia: si más adelante agregas cierre de sesión por API, puedes poner aquí un botón */}
      {/* <button onClick={logout} className="text-sm text-slate-600 underline">Cerrar sesión</button> */}
    </div>
  )
}
