import Link from 'next/link'

function Tile({ href, title, desc }: { href: string, title: string, desc: string }) {
  return (
    <Link href={href} className="block">
      <div className="rounded-2xl border p-5 hover:shadow-md transition">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-gray-600 mt-1">{desc}</div>
      </div>
    </Link>
  )
}

export default function TeacherHome() {
  const tiles = [
    { href: '/teacher/asistencia', title: 'Asistencia', desc: 'Marcar asistencia por curso y clase.' },
    { href: '/teacher/jefatura', title: 'Jefatura', desc: 'Ingresar y editar notas.' },
    { href: '/teacher/cursos', title: 'Mis Cursos', desc: 'Listado de cursos a cargo y asignaturas.' },
    { href: '/teacher/estudiantes', title: 'Estudiantes', desc: 'Fichas y comunicación con apoderados.' },
    { href: '/teacher/anuncios', title: 'Anuncios', desc: 'Publicaciones internas para cursos y niveles.' },
    { href: '/teacher/planificaciones', title: 'Planificaciones', desc: 'Unidades, objetivos y evidencias.' },
    { href: '/teacher/recursos', title: 'Recursos', desc: 'Bancos de guías, PPT, links y material.' },
  ]
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Panel Docente</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(t => <Tile key={t.href} {...t} />)}
      </div>
    </main>
  )
}
