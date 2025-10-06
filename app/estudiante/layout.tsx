// app/estudiante/layout.tsx
import type { ReactNode } from 'react'

export default function EstudianteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <img src="/img/logo.png" alt="Logo" className="h-8 w-8" />
            <div>
              <div className="text-lg font-bold leading-tight">Portal del Estudiante</div>
              <div className="text-xs text-slate-500 leading-tight">Saint Thomas Valparaíso</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {/* Si luego quieres mostrar el nombre real, puedes hidratarlo desde /api/me */}
            <span className="hidden sm:inline text-slate-600">Bienvenido/a</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  )
}
