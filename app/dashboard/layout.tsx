import React from 'react'
import NavBar from '@/components/NavBar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <NavBar />
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </section>
  )
}
