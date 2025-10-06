import Link from 'next/link'

export default function NavBar() {
  return (
    <header className="w-full border-b bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold">Saint Thomas</Link>
          <nav className="hidden md:flex items-center gap-4 text-sm text-gray-600">
            <Link href="/dashboard" className="hover:text-black">Dashboard</Link>
            <Link href="/teacher" className="hover:text-black">Profesor</Link>
            <Link href="/admin" className="hover:text-black">Admin</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/logout?redirect=/login"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Cerrar sesión
          </Link>
        </div>
      </div>
    </header>
  )
}
