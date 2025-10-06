import React from 'react'
import { requireTeacher } from '@/lib/authGuard'
import NavBar from '@/components/NavBar'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireTeacher()
  return (
    <section>
      <NavBar />
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </section>
  )
}
