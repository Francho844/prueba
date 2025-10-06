import React from 'react'
import { requireAdmin } from '@/lib/authGuard'
import NavBar from '@/components/NavBar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <section>
      <NavBar />
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </section>
  )
}
